import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CategoryLedgerService {
  private readonly logger = new Logger(CategoryLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value?: string | null): string {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  private appendNarrationMetadata(baseDescription?: string | null, reference?: string | null, narration?: string | null): string {
    const cleanedBase = this.normalizeText(baseDescription) || 'Transaction';
    const refTag = reference ? `Ref:${this.normalizeText(reference)}` : '';
    const noteTag = narration ? `Note:${this.normalizeText(narration)}` : '';

    const hasRef = refTag && cleanedBase.toLowerCase().includes(refTag.toLowerCase());
    const hasNote = noteTag && cleanedBase.toLowerCase().includes(noteTag.toLowerCase());

    const suffixes = [
      refTag && !hasRef ? refTag : '',
      noteTag && !hasNote ? noteTag : '',
    ].filter(Boolean);

    return suffixes.length ? `${cleanedBase} | ${suffixes.join(' | ')}` : cleanedBase;
  }

  private formatLedgerEntryNarration(entry: any) {
    return {
      ...entry,
      description: this.appendNarrationMetadata(entry.description, entry.reference, entry.narration),
    };
  }

  /**
   * Create a category ledger when expense/income category is created
   */
  async createCategoryLedger(
    categoryType: 'income' | 'expense',
    categoryId: number,
    categoryName: string,
  ) {
    try {
      const ledger = await this.prisma.categoryLedger.create({
        data: {
          categoryType,
          categoryName,
          ...(categoryType === 'expense'
            ? { expenseCategoryId: categoryId }
            : { incomeCategoryId: categoryId }),
          totalAmount: 0,
          balance: 0,
        },
      });

      this.logger.log(
        `Created ${categoryType} ledger for ${categoryName} (ID: ${ledger.id})`,
      );
      return ledger;
    } catch (error) {
      this.logger.error(
        `Failed to create category ledger for ${categoryName}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Post transaction to category ledger
   */
  async postTransaction(
    categoryLedgerId: number,
    type: 'debit' | 'credit' | 'transfer',
    amount: number | string,
    description: string,
    sourceType: string,
    sourceId?: string,
    reference?: string,
    narration?: string,
  ) {
    try {
      const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;

      // Get current ledger balance
      const ledger = await this.prisma.categoryLedger.findUnique({
        where: { id: categoryLedgerId },
      });

      if (!ledger) {
        throw new Error(`Category ledger ${categoryLedgerId} not found`);
      }

      // Calculate new balance
      let newBalance = Number(ledger.balance);
      if (type === 'debit') {
        newBalance = newBalance - amountNum;
      } else if (type === 'credit') {
        newBalance = newBalance + amountNum;
      }

      // Create ledger entry
      const entry = await this.prisma.categoryLedgerEntry.create({
        data: {
          categoryLedgerId,
          type,
          amount: amountNum,
          description: this.normalizeText(description) || `${type} transaction (${this.normalizeText(sourceType) || 'manual'})`,
          sourceType,
          sourceId: sourceId?.toString(),
          reference: this.normalizeText(reference) || null,
          narration: this.normalizeText(narration) || null,
          balanceAfter: newBalance,
        },
      });

      // Update ledger totals
      const newTotalAmount = Number(ledger.totalAmount) + amountNum;
      await this.prisma.categoryLedger.update({
        where: { id: categoryLedgerId },
        data: {
          totalAmount: newTotalAmount,
          balance: newBalance,
        },
      });

      this.logger.log(
        `Posted ${type} transaction (${amountNum}) to ledger ${categoryLedgerId}`,
      );

      return this.formatLedgerEntryNarration(entry);
    } catch (error) {
      this.logger.error(
        `Failed to post transaction to category ledger`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get category ledger with all entries
   */
  async getCategoryLedger(categoryLedgerId: number) {
    const ledger = await this.prisma.categoryLedger.findUnique({
      where: { id: categoryLedgerId },
      include: {
        entries: {
          orderBy: { date: 'desc' },
        },
        expenseCategory: true,
        incomeCategory: true,
      },
    });

    if (!ledger) return ledger;

    return {
      ...ledger,
      entries: Array.isArray(ledger.entries)
        ? ledger.entries.map((entry) => this.formatLedgerEntryNarration(entry))
        : [],
    };
  }

  /**
   * Get category ledger by category name
   */
  async getCategoryLedgerByName(categoryName: string) {
    // categoryName is not unique, use findFirst
    const ledger = await this.prisma.categoryLedger.findFirst({
      where: { categoryName },
      include: {
        entries: {
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!ledger) return ledger;

    return {
      ...ledger,
      entries: Array.isArray(ledger.entries)
        ? ledger.entries.map((entry) => this.formatLedgerEntryNarration(entry))
        : [],
    };
  }

  /**
   * Get all category ledgers with summary
   */
  async getAllCategoryLedgers(type?: 'income' | 'expense') {
    const ledgers = await this.prisma.categoryLedger.findMany({
      where: type ? { categoryType: type } : undefined,
      include: {
        entries: {
          orderBy: { date: 'desc' },
          take: 5, // Last 5 entries
        },
        expenseCategory: true,
        incomeCategory: true,
      },
      orderBy: { categoryName: 'asc' },
    });

    return ledgers.map((ledger) => ({
      ...ledger,
      entries: Array.isArray(ledger.entries)
        ? ledger.entries.map((entry) => this.formatLedgerEntryNarration(entry))
        : [],
    }));
  }

  /**
   * Get ledger entries for a category with pagination
   */
  async getCategoryLedgerEntries(
    categoryLedgerId: number,
    skip = 0,
    take = 20,
  ) {
    const [entries, total] = await Promise.all([
      this.prisma.categoryLedgerEntry.findMany({
        where: { categoryLedgerId },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      this.prisma.categoryLedgerEntry.count({
        where: { categoryLedgerId },
      }),
    ]);

    return {
      entries: entries.map((entry) => this.formatLedgerEntryNarration(entry)),
      total,
      skip,
      take,
    };
  }

  /**
   * Get SACCO financial summary from all category ledgers
   */
  async getSaccoFinancialSummary() {
    const categoryLedgers = await this.prisma.categoryLedger.findMany({
      include: {
        entries: true,
      },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    const incomeCategories = [];
    const expenseCategories = [];

    for (const ledger of categoryLedgers) {
      const balance = Number(ledger.balance);

      if (ledger.categoryType === 'income') {
        totalIncome += balance;
        incomeCategories.push({
          name: ledger.categoryName,
          balance: balance.toString(),
          entries: ledger.entries.length,
        });
      } else if (ledger.categoryType === 'expense') {
        totalExpenses += balance;
        expenseCategories.push({
          name: ledger.categoryName,
          balance: balance.toString(),
          entries: ledger.entries.length,
        });
      }
    }

    const netResult = totalIncome - totalExpenses;

    return {
      totalIncome: totalIncome.toString(),
      totalExpenses: totalExpenses.toString(),
      netResult: netResult.toString(),
      incomeCategories,
      expenseCategories,
    };
  }

  /**
   * Transfer between categories (with double-entry)
   */
  async transferBetweenCategories(
    fromCategoryLedgerId: number,
    toCategoryLedgerId: number,
    amount: number | string,
    description: string,
    reference?: string,
  ) {
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;

    try {
      // Post debit to source (out)
      await this.postTransaction(
        fromCategoryLedgerId,
        'debit',
        amountNum,
        `Transfer out: ${description}`,
        'transfer',
        `transfer_${Date.now()}`,
        reference,
      );

      // Post credit to destination (in)
      await this.postTransaction(
        toCategoryLedgerId,
        'credit',
        amountNum,
        `Transfer in: ${description}`,
        'transfer',
        `transfer_${Date.now()}`,
        reference,
      );

      this.logger.log(
        `Transferred ${amountNum} from ledger ${fromCategoryLedgerId} to ${toCategoryLedgerId}`,
      );

      return { success: true, amount: amountNum.toString() };
    } catch (error) {
      this.logger.error(
        `Failed to transfer between category ledgers`,
        error,
      );
      throw error;
    }
  }
}
