import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============== ASSET CRUD ==============

  async getAllAssets(status?: string) {
    return this.prisma.asset.findMany({
      where: status ? { status } : undefined,
      include: {
        purchaseAccount: true,
        disposalAccount: true,
        transactions: {
          orderBy: { date: 'desc' },
          take: 3,
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async getAssetById(id: number) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        purchaseAccount: true,
        disposalAccount: true,
        transactions: {
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!asset) {
      throw new BadRequestException(`Asset with ID ${id} not found`);
    }

    return asset;
  }

  // ============== ASSET PURCHASE ==============

  async purchaseAsset(data: {
    name: string;
    description?: string;
    category: string;
    purchasePrice: number | string;
    purchaseDate: string; // Date string (YYYY-MM-DD)
    purchaseAccountId: number;
    depreciationRate?: number;
  }) {
    try {
      const purchasePrice = typeof data.purchasePrice === 'string'
        ? parseFloat(data.purchasePrice)
        : data.purchasePrice;

      // Verify account exists
      const account = await this.prisma.account.findUnique({
        where: { id: data.purchaseAccountId },
      });

      if (!account) {
        throw new BadRequestException(
          `Account with ID ${data.purchaseAccountId} not found`,
        );
      }

      // Create asset
      const asset = await this.prisma.asset.create({
        data: {
          name: data.name,
          description: data.description,
          category: data.category,
          purchasePrice: purchasePrice,
          purchaseDate: new Date(data.purchaseDate),
          currentValue: purchasePrice, // Initial current value = purchase price
          purchaseAccountId: data.purchaseAccountId,
          depreciationRate: data.depreciationRate,
          status: 'active',
        },
        include: {
          purchaseAccount: true,
          transactions: true,
        },
      });

      // Create purchase transaction
      const transaction = await this.prisma.assetTransaction.create({
        data: {
          assetId: asset.id,
          type: 'purchase',
          amount: purchasePrice,
          accountId: data.purchaseAccountId,
          accountName: account.name,
          accountType: account.type,
          description: `Purchased ${data.name}`,
          reference: `ASSET-PURCHASE-${asset.id}`,
          date: new Date(data.purchaseDate),
        },
      });

      // Deduct from account balance
      await this.prisma.account.update({
        where: { id: data.purchaseAccountId },
        data: {
          balance: {
            decrement: purchasePrice,
          },
        },
      });

      this.logger.log(
        `Asset purchased: ${data.name} (ID: ${asset.id}) for KES ${purchasePrice}`,
      );

      return {
        asset,
        transaction,
      };
    } catch (error) {
      this.logger.error('Failed to purchase asset', error);
      throw error;
    }
  }

  // ============== ASSET SALE ==============

  async sellAsset(data: {
    assetId: number;
    disposalPrice: number | string;
    disposalDate: string;
    disposalAccountId: number;
    disposalReason?: string;
  }) {
    try {
      const disposalPrice = typeof data.disposalPrice === 'string'
        ? parseFloat(data.disposalPrice)
        : data.disposalPrice;

      // Get asset
      const asset = await this.getAssetById(data.assetId);

      if (asset.status !== 'active') {
        throw new BadRequestException(
          `Asset cannot be sold. Current status: ${asset.status}`,
        );
      }

      // Verify account exists
      const account = await this.prisma.account.findUnique({
        where: { id: data.disposalAccountId },
      });

      if (!account) {
        throw new BadRequestException(
          `Account with ID ${data.disposalAccountId} not found`,
        );
      }

      // Calculate gain/loss
      const gainLoss = disposalPrice - Number(asset.currentValue);

      // Update asset status
      const updatedAsset = await this.prisma.asset.update({
        where: { id: data.assetId },
        data: {
          status: 'sold',
          disposalDate: new Date(data.disposalDate),
          disposalPrice: disposalPrice,
          disposalAccountId: data.disposalAccountId,
          disposalReason: data.disposalReason,
        },
        include: {
          purchaseAccount: true,
          disposalAccount: true,
        },
      });

      // Create sale transaction
      const transaction = await this.prisma.assetTransaction.create({
        data: {
          assetId: data.assetId,
          type: 'sale',
          amount: disposalPrice,
          accountId: data.disposalAccountId,
          accountName: account.name,
          accountType: account.type,
          gainLoss: gainLoss,
          description: `Sold ${asset.name}`,
          reference: `ASSET-SALE-${data.assetId}`,
          notes: data.disposalReason,
          date: new Date(data.disposalDate),
        },
      });

      // Add proceeds to account balance
      await this.prisma.account.update({
        where: { id: data.disposalAccountId },
        data: {
          balance: {
            increment: disposalPrice,
          },
        },
      });

      this.logger.log(
        `Asset sold: ${asset.name} (ID: ${data.assetId}) for KES ${disposalPrice} (Gain/Loss: KES ${gainLoss})`,
      );

      return {
        asset: updatedAsset,
        transaction,
        gainLoss,
      };
    } catch (error) {
      this.logger.error('Failed to sell asset', error);
      throw error;
    }
  }

  // ============== ASSET TRANSACTIONS ==============

  async getAssetTransactions(assetId: number) {
    return this.prisma.assetTransaction.findMany({
      where: { assetId },
      include: {
        account: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async getAssetTransactionsByType(type: 'purchase' | 'sale' | 'depreciation') {
    return this.prisma.assetTransaction.findMany({
      where: { type },
      include: {
        asset: true,
        account: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  // ============== ASSET REPORTS ==============

  async getAssetsSummary() {
    const assets = await this.prisma.asset.findMany({
      include: {
        transactions: true,
      },
    });

    const summary = {
      totalAssets: assets.length,
      activeAssets: assets.filter((a) => a.status === 'active').length,
      soldAssets: assets.filter((a) => a.status === 'sold').length,
      totalPurchaseValue: 0,
      totalCurrentValue: 0,
      totalDisposalValue: 0,
      totalGainLoss: 0,
      byCategory: {} as Record<string, any>,
    };

    for (const asset of assets) {
      const purchaseValue = Number(asset.purchasePrice);
      const currentValue = Number(asset.currentValue);
      const disposalValue = asset.disposalPrice ? Number(asset.disposalPrice) : 0;

      summary.totalPurchaseValue += purchaseValue;
      summary.totalCurrentValue += currentValue;
      summary.totalDisposalValue += disposalValue;

      // Track gain/loss for sold assets
      if (asset.status === 'sold' && asset.disposalPrice) {
        const gainLoss = disposalValue - currentValue;
        summary.totalGainLoss += gainLoss;
      }

      // Group by category
      const category = asset.category || 'Uncategorized';
      if (!summary.byCategory[category]) {
        summary.byCategory[category] = {
          count: 0,
          purchaseValue: 0,
          currentValue: 0,
          active: 0,
          sold: 0,
        };
      }

      summary.byCategory[category].count += 1;
      summary.byCategory[category].purchaseValue += purchaseValue;
      summary.byCategory[category].currentValue += currentValue;

      if (asset.status === 'active') {
        summary.byCategory[category].active += 1;
      } else if (asset.status === 'sold') {
        summary.byCategory[category].sold += 1;
      }
    }

    return summary;
  }

  async getAssetsDepreciation() {
    const assets = await this.prisma.asset.findMany({
      where: {
        status: 'active',
        depreciationRate: { not: null },
      },
    });

    return assets.map((asset) => {
      const purchaseValue = Number(asset.purchasePrice);
      const currentValue = Number(asset.currentValue);
      const depreciated = purchaseValue - currentValue;
      const depreciatedPercent =
        (depreciated / purchaseValue) * 100;

      return {
        ...asset,
        purchaseValue,
        currentValue,
        depreciated,
        depreciatedPercent: parseFloat(depreciatedPercent.toFixed(2)),
        yearsHeld: asset.purchaseDate
          ? Math.floor(
            (new Date().getTime() - asset.purchaseDate.getTime()) /
            (1000 * 60 * 60 * 24 * 365),
          )
          : 0,
      };
    });
  }

  // ============== UTILITY METHODS ==============

  async updateAssetValue(assetId: number, newValue: number) {
    const asset = await this.getAssetById(assetId);

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        currentValue: newValue,
        lastValueUpdate: new Date(),
      },
    });

    // Log adjustment transaction
    await this.prisma.assetTransaction.create({
      data: {
        assetId: assetId,
        type: 'adjustment',
        amount: newValue,
        description: `Value adjustment from KES ${Number(asset.currentValue)} to KES ${newValue}`,
        reference: `ASSET-ADJUST-${assetId}`,
      },
    });

    return updated;
  }

  async deleteAsset(id: number) {
    const asset = await this.getAssetById(id);

    if (asset.status !== 'active') {
      throw new BadRequestException(
        `Cannot delete ${asset.status} asset. Only active assets can be deleted.`,
      );
    }

    // Delete transactions first
    await this.prisma.assetTransaction.deleteMany({
      where: { assetId: id },
    });

    // Delete asset
    return this.prisma.asset.delete({
      where: { id },
    });
  }
}
