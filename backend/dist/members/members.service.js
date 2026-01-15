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
exports.MembersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let MembersService = class MembersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        const existing = await this.prisma.member.findUnique({ where: { phone: dto.phone } });
        if (existing)
            throw new common_1.BadRequestException('Member with this phone already exists.');
        const { nextOfKin, ...rest } = dto;
        return this.prisma.member.create({
            data: {
                ...rest,
                nextOfKin: nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : [],
            },
        });
    }
    async findAll() {
        return this.prisma.member.findMany({ orderBy: { createdAt: 'desc' } });
    }
    async findOne(id) {
        const member = await this.prisma.member.findUnique({ where: { id } });
        if (!member)
            throw new common_1.NotFoundException('Member not found.');
        return member;
    }
    async update(id, dto) {
        await this.findOne(id);
        const { nextOfKin, ...rest } = dto;
        return this.prisma.member.update({
            where: { id },
            data: {
                ...rest,
                nextOfKin: nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : [],
            },
        });
    }
    async suspend(id) {
        await this.findOne(id);
        return this.prisma.member.update({ where: { id }, data: { active: false } });
    }
    async reactivate(id) {
        await this.findOne(id);
        return this.prisma.member.update({ where: { id }, data: { active: true } });
    }
    async ledger(id) {
        const member = await this.prisma.member.findUnique({
            where: { id },
            include: { ledger: true },
        });
        if (!member)
            throw new common_1.NotFoundException('Member not found.');
        return member;
    }
};
exports.MembersService = MembersService;
exports.MembersService = MembersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MembersService);
//# sourceMappingURL=members.service.js.map