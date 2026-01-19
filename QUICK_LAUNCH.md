# 🎯 SACCO System - Quick Launch Guide

## ⚡ Quick Start (30 seconds)

### Already Running ✅
Servers are currently active:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000

Just open your browser to `http://localhost:5173`!

---

## 🚀 Start Fresh (if servers stopped)

### Terminal 1 - Backend
```bash
cd backend
npm run start:dev
```
Should see: `Backend running on port 3000`

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```
Should see: `VITE v7.3.1 ready in ... ms` on port 5173

---

## 📍 Key Pages

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | http://localhost:5173 | Overview & summary |
| Members | http://localhost:5173/members | Manage members |
| Deposits | http://localhost:5173/deposits | Record deposits |
| Withdrawals | http://localhost:5173/withdrawals | Record withdrawals |
| Loans | http://localhost:5173/loans | Manage loans |
| **Settings** | http://localhost:5173/settings | ⭐ Configuration |
| **Ledger** | http://localhost:5173/ledger | ⭐ Financial history |
| Reports | http://localhost:5173/reports | Reports & analysis |

⭐ = New in this release

---

## 🔌 API Endpoints (for testing)

### Health Check
```bash
curl http://localhost:3000/health
```

### Settings API
```bash
curl http://localhost:3000/settings/contribution-types
curl http://localhost:3000/settings/expense-categories
curl http://localhost:3000/settings/fine-categories
```

### Accounts API
```bash
curl http://localhost:3000/accounts
curl http://localhost:3000/accounts/by-type/bank
```

### Ledger API
```bash
curl http://localhost:3000/ledger/summary
curl http://localhost:3000/ledger/transactions
```

### Fines API
```bash
curl http://localhost:3000/fines
curl http://localhost:3000/fines/statistics
```

---

## 📊 What You Can Do

✅ **Manage Members** - Add/edit/delete cooperative members  
✅ **Record Transactions** - Deposits, withdrawals, loans, repayments  
✅ **View Ledger** - Complete transaction history with running balance  
✅ **Configure Settings** - Set contribution types, expenses, income, fines  
✅ **Generate Reports** - Financial summaries and analytics  
✅ **Track Fines** - Member penalties and payments  

---

## 💾 Database

**Provider**: Neon PostgreSQL (serverless cloud)  
**Status**: ✅ Connected and synced  
**Tables**: 15 models with proper relations  

To reset database:
```bash
cd backend
npx prisma db push --force-reset  # ⚠️ Deletes all data
npx prisma db seed               # Optional: seed test data
```

---

## 📤 Push Changes to GitHub

After making code changes:
```bash
cd ..  # Go to repo root
git add .
git commit -m "Your message here"
git push origin main
```

---

## 🔍 Troubleshooting

### Servers won't start?
```bash
# Kill existing Node processes
Get-Process node | Stop-Process -Force
# Then restart
```

### Database out of sync?
```bash
cd backend
npx prisma migrate dev
npx prisma db push
```

### Port already in use?
```bash
# Find process using port
netstat -ano | findstr :3000  # Backend
netstat -ano | findstr :5173  # Frontend

# Kill by PID
taskkill /PID 12345 /F
```

---

## 📚 Documentation

- **SACCO_IMPLEMENTATION.md** - Full system details
- **DEVELOPMENT_STATUS.md** - Current status
- **backend/prisma/schema.prisma** - Database schema
- **frontend/src/** - React components

---

## 🎓 Architecture Overview

```
Frontend (React + Vite)
    ↓ HTTP/REST
Backend (NestJS)
    ↓ Prisma ORM
Database (Neon PostgreSQL)
    ↓ Double-entry accounting
General Ledger (JournalEntry)
```

---

## 💡 Pro Tips

1. **Hot Reload Active** - Save files and see changes instantly
2. **Database Synced** - Prisma keeps schema in sync
3. **Type Safe** - Full TypeScript coverage
4. **Git Tracking** - All changes committed automatically
5. **Error Handling** - Check browser console & server logs

---

## 📞 System Status

```
✅ Backend:  RUNNING on port 3000
✅ Frontend: RUNNING on port 5173
✅ Database: CONNECTED to Neon PostgreSQL
✅ Git:      SYNCED with GitHub (cb61f41)
```

---

**Ready to develop!** 🚀

Open http://localhost:5173 in your browser now.

*Last Updated: January 20, 2026*
