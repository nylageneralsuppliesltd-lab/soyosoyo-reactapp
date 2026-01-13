"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let DashboardService = class DashboardService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getSummary(year = new Date().getFullYear()) {
        const members = await this.prisma.member.findMany({
            select: { id: true, name: true, balance: true, active: true },
        });
        const deposits = [];
        const withdrawals = [];
        const loans = [];
        const repayments = [];
        const monthlyContributions = [];
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
            label: new Date(year, i, 1).toLocaleString('default', { month: 'short' }),
            contributions: 0,
            income: 0,
            expenses: 0,
            interest: 0,
        }));
        const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
        const totalContributions = 0;
        return {
            members,
            totalMembers: members.length,
            activeMembers: members.filter(m => m.active).length,
            suspendedMembers: members.filter(m => !m.active).length,
            totalBalance,
            contributionsTotal: totalContributions,
            incomeTotal: 0,
            expensesTotal: 0,
            interestIncomeTotal: 0,
            totalLoansDisbursed: 0,
            monthlyData,
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map