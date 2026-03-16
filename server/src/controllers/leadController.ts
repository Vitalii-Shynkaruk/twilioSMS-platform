import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { parse } from 'csv-parse/sync';

export class LeadController {

  static async list(req: AuthRequest, res: Response): Promise<void> {
    const {
      page = '1',
      limit = '50',
      search,
      status,
      tags,
      assignedRepId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { company: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = { in: (status as string).split(',') };
    }

    if (tags) {
      where.tags = {
        some: { tagId: { in: (tags as string).split(',') } },
      };
    }

    if (assignedRepId) {
      where.assignedRepId = assignedRepId;
    }

    if (req.query.source) {
      where.source = { contains: req.query.source as string, mode: 'insensitive' };
    }

    if (req.query.state) {
      where.state = { contains: req.query.state as string, mode: 'insensitive' };
    }

    // Rep can only see their leads
    if (req.user?.role === 'REP') {
      where.assignedRepId = req.user.id;
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          tags: { include: { tag: true } },
          assignedRep: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { conversations: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        assignedRep: {
          select: { id: true, firstName: true, lastName: true },
        },
        conversations: {
          include: {
            messages: {
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        pipelineCards: {
          include: { stage: true },
        },
        automationRuns: {
          where: { isActive: true },
          include: { automationRule: true },
        },
        campaignLeads: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!lead) throw new AppError('Lead not found', 404);

    res.json({ lead });
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { firstName, lastName, phone, email, company, state, source, tags, assignedRepId } = req.body;

    if (!firstName || !phone) {
      throw new AppError('First name and phone are required', 400);
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    const e164Phone = normalizedPhone.startsWith('1')
      ? `+${normalizedPhone}`
      : `+1${normalizedPhone}`;

    // Check for duplicate
    const existing = await prisma.lead.findUnique({
      where: { phone: e164Phone },
    });

    if (existing) {
      throw new AppError('Lead with this phone number already exists', 409);
    }

    // Check suppression
    const suppressed = await prisma.suppressionEntry.findUnique({
      where: { phone: e164Phone },
    });

    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        phone: e164Phone,
        email,
        company,
        state,
        source,
        assignedRepId,
        isSuppressed: !!suppressed,
        suppressReason: suppressed?.reason,
      },
    });

    // Add tags
    if (tags && tags.length > 0) {
      await prisma.leadTag.createMany({
        data: tags.map((tagId: string) => ({
          leadId: lead.id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    // Create pipeline card
    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { isDefault: true },
    });

    if (defaultStage) {
      await prisma.pipelineCard.create({
        data: {
          leadId: lead.id,
          stageId: defaultStage.id,
        },
      });
    }

    res.status(201).json({ lead });
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { firstName, lastName, email, company, state, source, status, assignedRepId, notes } = req.body;

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new AppError('Lead not found', 404);

    const data: any = {};
    if (firstName) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) data.email = email;
    if (company !== undefined) data.company = company;
    if (state !== undefined) data.state = state;
    if (source !== undefined) data.source = source;
    if (status) data.status = status;
    if (assignedRepId !== undefined) data.assignedRepId = assignedRepId;
    if (notes !== undefined) data.notes = notes;

    const lead = await prisma.lead.update({
      where: { id },
      data,
      include: {
        tags: { include: { tag: true } },
      },
    });

    res.json({ lead });
  }

  static async importCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Query default stage ONCE before the loop
    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { isDefault: true },
    });

    // Process in chunks of 500 for better DB performance
    const CHUNK_SIZE = 500;
    for (let chunk = 0; chunk < records.length; chunk += CHUNK_SIZE) {
      const batch = records.slice(chunk, chunk + CHUNK_SIZE);
      const leadsToUpsert: Array<{
        phone: string;
        firstName: string;
        lastName: string;
        email: string | null;
        company: string | null;
        state: string | null;
        source: string;
      }> = [];

      // Parse and validate the batch
      for (const record of batch) {
        const phone = (record.phone || record.Phone || record.PHONE || '').replace(/\D/g, '');
        if (!phone) {
          errors++;
          errorDetails.push('Row missing phone number');
          continue;
        }

        const e164Phone = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;
        const firstName = record.firstName || record.first_name || record.FirstName || record.FIRST_NAME || 'Unknown';
        const lastName = record.lastName || record.last_name || record.LastName || record.LAST_NAME || '';

        leadsToUpsert.push({
          phone: e164Phone,
          firstName,
          lastName,
          email: record.email || record.Email || record.EMAIL || null,
          company: record.company || record.Company || record.COMPANY || null,
          state: record.state || record.State || record.STATE || null,
          source: record.source || record.Source || 'csv_import',
        });
      }

      // Batch upsert leads using a transaction
      if (leadsToUpsert.length > 0) {
        const results = await prisma.$transaction(
          leadsToUpsert.map(lead =>
            prisma.lead.upsert({
              where: { phone: lead.phone },
              create: lead,
              update: {
                lastName: { set: lead.lastName || undefined },
                email: lead.email || undefined,
                company: lead.company || undefined,
              },
            })
          )
        );

        // Create pipeline cards for new leads in batch
        const newLeads = results.filter(r => r.createdAt.getTime() > Date.now() - 10000);
        imported += newLeads.length;
        duplicates += results.length - newLeads.length;

        if (defaultStage && newLeads.length > 0) {
          await prisma.pipelineCard.createMany({
            data: newLeads.map(lead => ({
              leadId: lead.id,
              stageId: defaultStage.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    res.json({
      imported,
      duplicates,
      errors,
      total: records.length,
      errorDetails: errorDetails.slice(0, 10),
    });
  }

  /**
   * POST /leads/preview — Parse first N rows of CSV for preview + column detection
   * Returns detected columns, sample data rows, and auto-mapping suggestions.
   */
  static async previewCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      throw new AppError('CSV file is empty or has no data rows', 400);
    }

    const csvColumns = Object.keys(records[0]);

    // Auto-detect column mappings
    const fieldMappingSuggestions: Record<string, string | null> = {
      phone: null,
      firstName: null,
      lastName: null,
      email: null,
      company: null,
      city: null,
      state: null,
      source: null,
    };

    const columnAliases: Record<string, string[]> = {
      phone: ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone', 'number'],
      firstName: ['firstname', 'first_name', 'first', 'fname', 'given_name'],
      lastName: ['lastname', 'last_name', 'last', 'lname', 'surname', 'family_name'],
      email: ['email', 'email_address', 'emailaddress', 'e_mail'],
      company: ['company', 'company_name', 'companyname', 'business', 'organization', 'org'],
      city: ['city', 'town', 'locality'],
      state: ['state', 'province', 'region', 'st'],
      source: ['source', 'lead_source', 'leadsource', 'origin', 'channel', 'utm_source'],
    };

    for (const [field, aliases] of Object.entries(columnAliases)) {
      for (const col of csvColumns) {
        if (aliases.includes(col.toLowerCase().trim())) {
          fieldMappingSuggestions[field] = col;
          break;
        }
      }
    }

    // Return preview data (first 10 rows only)
    const previewRows = records.slice(0, 10);
    const totalRows = records.length;

    res.json({
      totalRows,
      columns: csvColumns,
      mappingSuggestions: fieldMappingSuggestions,
      previewRows,
    });
  }

  /**
   * POST /leads/import-mapped — Import CSV with explicit column mapping from frontend
   */
  static async importMappedCSV(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const mappingStr = req.body.mapping;
    if (!mappingStr) {
      throw new AppError('Column mapping is required', 400);
    }

    let mapping: Record<string, string>;
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      throw new AppError('Invalid mapping JSON', 400);
    }

    if (!mapping.phone) {
      throw new AppError('Phone column mapping is required', 400);
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { isDefault: true },
    });

    const CHUNK_SIZE = 500;
    for (let chunk = 0; chunk < records.length; chunk += CHUNK_SIZE) {
      const batch = records.slice(chunk, chunk + CHUNK_SIZE);
      const leadsToUpsert: Array<{
        phone: string;
        firstName: string;
        lastName: string;
        email: string | null;
        company: string | null;
        state: string | null;
        city: string | null;
        source: string;
      }> = [];

      for (const record of batch) {
        const rawPhone = (mapping.phone ? record[mapping.phone] : '').replace(/\D/g, '');
        if (!rawPhone) {
          errors++;
          errorDetails.push('Row missing phone number');
          continue;
        }

        const e164Phone = rawPhone.startsWith('1') ? `+${rawPhone}` : `+1${rawPhone}`;

        leadsToUpsert.push({
          phone: e164Phone,
          firstName: mapping.firstName ? (record[mapping.firstName] || 'Unknown') : 'Unknown',
          lastName: mapping.lastName ? (record[mapping.lastName] || '') : '',
          email: mapping.email ? (record[mapping.email] || null) : null,
          company: mapping.company ? (record[mapping.company] || null) : null,
          city: mapping.city ? (record[mapping.city] || null) : null,
          state: mapping.state ? (record[mapping.state] || null) : null,
          source: mapping.source ? (record[mapping.source] || 'csv_import') : 'csv_import',
        });
      }

      if (leadsToUpsert.length > 0) {
        const results = await prisma.$transaction(
          leadsToUpsert.map(lead =>
            prisma.lead.upsert({
              where: { phone: lead.phone },
              create: lead,
              update: {
                lastName: { set: lead.lastName || undefined },
                email: lead.email || undefined,
                company: lead.company || undefined,
              },
            })
          )
        );

        const newLeads = results.filter(r => r.createdAt.getTime() > Date.now() - 10000);
        imported += newLeads.length;
        duplicates += results.length - newLeads.length;

        if (defaultStage && newLeads.length > 0) {
          await prisma.pipelineCard.createMany({
            data: newLeads.map(lead => ({
              leadId: lead.id,
              stageId: defaultStage.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    res.json({
      imported,
      duplicates,
      errors,
      total: records.length,
      errorDetails: errorDetails.slice(0, 10),
    });
  }

  static async addTag(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { tagId } = req.body;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);

    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new AppError('Tag not found', 404);

    await prisma.leadTag.create({
      data: { leadId: id, tagId },
    });

    res.json({ message: 'Tag added' });
  }

  static async removeTag(req: AuthRequest, res: Response): Promise<void> {
    const { id, tagId } = req.params;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);

    await prisma.leadTag.deleteMany({
      where: { leadId: id, tagId },
    });

    res.json({ message: 'Tag removed' });
  }

  static async bulkAction(req: AuthRequest, res: Response): Promise<void> {
    const { action, leadIds, data } = req.body;

    switch (action) {
      case 'assign_rep':
        await prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { assignedRepId: data.repId },
        });
        break;

      case 'change_status':
        await prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { status: data.status },
        });
        break;

      case 'add_tag':
        await prisma.leadTag.createMany({
          data: leadIds.map((leadId: string) => ({
            leadId,
            tagId: data.tagId,
          })),
          skipDuplicates: true,
        });
        break;

      case 'suppress':
        await prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: {
            isSuppressed: true,
            suppressedAt: new Date(),
            suppressReason: data.reason || 'manual',
          },
        });
        break;

      default:
        throw new AppError('Unknown action', 400);
    }

    res.json({ message: 'Bulk action completed', affected: leadIds.length });
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new AppError('Lead not found', 404);

    // Soft-delete: mark as deleted instead of destroying data
    await prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Lead deleted successfully' });
  }

  /**
   * GET /leads/export — Export leads as streaming CSV (cursor-based, OOM-safe)
   */
  static async exportCSV(req: AuthRequest, res: Response): Promise<void> {
    const { status, tags, assignedRepId, search } = req.query;

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = { in: (status as string).split(',') };
    if (tags) where.tags = { some: { tagId: { in: (tags as string).split(',') } } };
    if (assignedRepId) where.assignedRepId = assignedRepId;
    if (req.user?.role === 'REP') where.assignedRepId = req.user.id;
    // Exclude soft-deleted
    where.deletedAt = null;

    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`);

    // Write header
    const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Company', 'State', 'Status', 'Source', 'Tags', 'Assigned Rep', 'Created At', 'Last Contacted'];
    res.write(headers.join(',') + '\n');

    // Stream in batches of 500
    const BATCH_SIZE = 500;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const leads = await prisma.lead.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          assignedRep: { select: { firstName: true, lastName: true } },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (leads.length === 0) {
        hasMore = false;
        break;
      }

      for (const l of leads) {
        const row = [
          l.firstName,
          l.lastName || '',
          l.phone,
          l.email || '',
          l.company || '',
          l.state || '',
          l.status,
          l.source || '',
          l.tags.map(t => t.tag.name).join('; '),
          l.assignedRep ? `${l.assignedRep.firstName} ${l.assignedRep.lastName}` : '',
          l.createdAt.toISOString(),
          l.lastContactedAt?.toISOString() || '',
        ];
        res.write(row.map(escapeCSV).join(',') + '\n');
      }

      cursor = leads[leads.length - 1].id;
      if (leads.length < BATCH_SIZE) hasMore = false;
    }

    res.end();
  }
}
