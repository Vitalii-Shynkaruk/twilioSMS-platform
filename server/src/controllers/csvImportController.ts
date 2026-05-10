import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { DealStage, ProductType } from '@prisma/client';

const STAGE_MAP: Record<string, DealStage> = {
  New: DealStage.NEW_LEAD,
  new: DealStage.NEW_LEAD,
  'New Lead': DealStage.NEW_LEAD,
  Engaged: DealStage.ENGAGED_INTERESTED,
  Interested: DealStage.ENGAGED_INTERESTED,
  Qualified: DealStage.QUALIFIED,
  Submitted: DealStage.SUBMITTED_IN_REVIEW,
  submitted: DealStage.SUBMITTED_IN_REVIEW,
  'In Review': DealStage.SUBMITTED_IN_REVIEW,
  'Approved/Offers': DealStage.APPROVED_OFFERS,
  'approved/offers': DealStage.APPROVED_OFFERS,
  Approved: DealStage.APPROVED_OFFERS,
  Committed: DealStage.COMMITTED_FUNDING,
  committed: DealStage.COMMITTED_FUNDING,
  Funded: DealStage.FUNDED,
  funded: DealStage.FUNDED,
  'Merchant Funded': DealStage.FUNDED,
  'merchant funded': DealStage.FUNDED,
  'Nurture (Lost)': DealStage.NURTURE,
  nurture: DealStage.NURTURE,
  Nurture: DealStage.NURTURE,
  'Closed (DQ)': DealStage.CLOSED,
  closed: DealStage.CLOSED,
  Closed: DealStage.CLOSED,
};

const PRODUCT_MAP: Record<string, ProductType> = {
  MCA: ProductType.MCA,
  LOC: ProductType.LOC,
  'Line of Credit': ProductType.LOC,
  Equipment: ProductType.EQUIPMENT,
  HELOC: ProductType.HELOC,
  SBA: ProductType.SBA,
  CRE: ProductType.CRE,
  Bridge: ProductType.BRIDGE,
};

function parseOriginator(value: string): { firstName: string; lastName: string } | null {
  if (!value || value.trim() === '' || value.toLowerCase() === 'n/a') return null;
  const parts = value.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || '' };
}

function parseAmount(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(value: string): Date | null {
  if (!value || value.trim() === '') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export class CsvImportController {
  static async importCsv(req: AuthRequest, res: Response) {
    const { rows, dryRun } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    const batchId = `import_${Date.now()}`;
    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[],
    };

    const allUsers = await prisma.user.findMany({
      select: { id: true, firstName: true, lastName: true, initials: true },
    });

    const defaultRep = allUsers.find((u: any) => u.role === 'ADMIN') || allUsers[0];
    if (!defaultRep) {
      return res.status(400).json({ error: 'No users exist. Run seed first.' });
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const businessName = row['Business Name'] || row['business_name'] || row['Merchant'] || row['merchant'] || '';
        const contactName = row['Contact Name'] || row['contact_name'] || row['Contact'] || '';
        const phone = (row['Phone'] || row['phone'] || row['Phone Number'] || '').replace(/\D/g, '');
        const email = row['Email'] || row['email'] || '';

        if (!businessName && !contactName) {
          results.errors.push({ row: i + 1, error: 'No business name or contact name' });
          results.skipped++;
          continue;
        }

        const rawStage = row['Stage'] || row['stage'] || row['Status'] || row['status'] || 'New';
        const stage = STAGE_MAP[rawStage] || STAGE_MAP[rawStage.toLowerCase()] || DealStage.NEW_LEAD;

        const rawProduct = row['Product'] || row['product'] || row['Product Type'] || '';
        const productType = PRODUCT_MAP[rawProduct] || undefined;

        const amount = parseAmount(row['Amount'] || row['amount'] || row['Deal Amount'] || row['Funded Amount'] || '');

        const rawOriginator =
          row['FDR Originator'] || row['Originator'] || row['originator'] || row['Rep'] || row['rep'] || '';
        let repId: string = defaultRep.id;
        const originator = parseOriginator(rawOriginator);
        if (originator) {
          const match = allUsers.find(
            (u: any) =>
              u.firstName.toLowerCase() === originator.firstName.toLowerCase() &&
              (originator.lastName === '' || u.lastName.toLowerCase() === originator.lastName.toLowerCase()),
          );
          if (match) repId = match.id;
        }

        const fundedDate = parseDate(row['Funded Date'] || row['funded_date'] || '');
        const createdDate = parseDate(row['Created Date'] || row['created_date'] || row['Date'] || '');
        const notes = row['Notes'] || row['notes'] || '';

        if (dryRun) {
          results.created++;
          continue;
        }

        let client;
        if (phone) {
          client = await prisma.client.upsert({
            where: { phone },
            update: { businessName: businessName || contactName },
            create: {
              businessName: businessName || contactName,
              contactName: contactName || undefined,
              phone,
              email: email || undefined,
            },
          });
        } else {
          client = await prisma.client.create({
            data: {
              businessName: businessName || contactName,
              contactName: contactName || undefined,
              email: email || undefined,
            },
          });
        }

        const deal = await prisma.deal.create({
          data: {
            clientId: client.id,
            assignedRepId: repId,
            stage,
            stageLabel: rawStage,
            productType,
            dealAmount: amount > 0 ? amount : undefined,
            needsAmount: amount === 0,
            importBatch: batchId,
            originatorName: rawOriginator || undefined,
            notes: notes || undefined,
            isHot: false,
            ...(createdDate ? { createdAt: createdDate } : {}),
          },
        });

        if (stage === DealStage.FUNDED && amount > 0) {
          await prisma.fundingEvent.create({
            data: {
              dealId: deal.id,
              repId,
              amountFunded: amount,
              productType: productType || ProductType.MCA,
              fundedDate: fundedDate || createdDate || new Date(),
            },
          });

          await prisma.client.update({
            where: { id: client.id },
            data: {
              totalFunded: { increment: amount },
              fundingCount: { increment: 1 },
              lastFundedDate: fundedDate || createdDate || new Date(),
            },
          });
        }

        results.created++;
      } catch (error: any) {
        results.errors.push({ row: i + 1, error: error.message || 'Unknown error' });
        results.skipped++;
      }
    }

    res.json({
      success: true,
      batchId: dryRun ? null : batchId,
      ...results,
    });
  }

  static async getBatches(req: AuthRequest, res: Response) {
    const batches = await prisma.deal.groupBy({
      by: ['importBatch'],
      where: { importBatch: { not: null } },
      _count: { _all: true },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'desc' } },
    });

    res.json(
      batches.map((b: any) => ({
        batchId: b.importBatch,
        count: b._count._all,
        importedAt: b._min.createdAt,
      })),
    );
  }

  static async rollbackBatch(req: AuthRequest, res: Response) {
    const { batchId } = req.params;

    const deals = await prisma.deal.findMany({
      where: { importBatch: batchId },
      select: { id: true },
    });

    if (deals.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const dealIds = deals.map((d: any) => d.id);

    await prisma.fundingEvent.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.dealEvent.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.offer.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.renewalTask.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.deal.deleteMany({ where: { importBatch: batchId } });

    res.json({ deleted: dealIds.length, batchId });
  }
}
