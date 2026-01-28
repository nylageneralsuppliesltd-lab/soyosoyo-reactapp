import { Test, TestingModule } from '@nestjs/testing';
import { EclService } from './ecl.service';
import { PrismaService } from '../prisma.service';

// Mock PrismaService
const mockPrisma = {
  loan: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  iFRSConfig: {
    findUnique: jest.fn(),
  },
  eclRun: {
    create: jest.fn(),
  },
};

describe('EclService', () => {
  let service: EclService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EclService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EclService>(EclService);
    jest.clearAllMocks();
  });

  it('should skip FVPL loans in ECL calculation', async () => {
    mockPrisma.iFRSConfig.findUnique.mockResolvedValue({ value: JSON.stringify({ pdStage1: 0.01, pdStage2: 0.05, pdStage3: 0.2, lgd: 0.6 }) });
    mockPrisma.loan.findMany.mockResolvedValue([
      { id: 1, balance: 1000, status: 'active', classification: 'fvpl', ecl: 0 },
      { id: 2, balance: 2000, status: 'active', classification: 'amortized_cost', ecl: 0 },
    ]);
    mockPrisma.eclRun.create.mockResolvedValue({});
    mockPrisma.loan.update.mockResolvedValue({});

    const result = await service.runEcl(true);
    expect(result.skippedFVPL).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.loans).toBe(2);
  });

  it('should calculate ECL for amortized_cost loans', async () => {
    mockPrisma.iFRSConfig.findUnique.mockResolvedValue({ value: JSON.stringify({ pdStage1: 0.01, pdStage2: 0.05, pdStage3: 0.2, lgd: 0.6 }) });
    mockPrisma.loan.findMany.mockResolvedValue([
      { id: 2, balance: 2000, status: 'active', classification: 'amortized_cost', ecl: 0 },
    ]);
    mockPrisma.eclRun.create.mockResolvedValue({});
    mockPrisma.loan.update.mockResolvedValue({});

    const result = await service.runEcl(false);
    expect(result.skippedFVPL).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.loans).toBe(1);
    expect(mockPrisma.loan.update).toHaveBeenCalled();
  });
});
