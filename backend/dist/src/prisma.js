"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_neon_1 = require("@prisma/adapter-neon");
const adapter = new adapter_neon_1.PrismaNeon({
    connectionString: process.env.DATABASE_URL,
});
exports.prisma = new client_1.PrismaClient({ adapter });
exports.prisma.$connect().catch((err) => {
    console.error('Failed to connect to the database:', err);
});
//# sourceMappingURL=prisma.js.map