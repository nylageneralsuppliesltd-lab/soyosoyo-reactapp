# SACCO Member Module Documentation

## 📋 Overview

A complete, production-ready member management system for SACCO (Savings and Credit Cooperative) organizations. This module includes comprehensive validation, advanced search/filtering, pagination, and a professional, mobile-responsive user interface.

## 🎯 Features

### Backend Features (NestJS + Prisma)

- ✅ **Comprehensive Validation**
  - Kenyan phone number format validation (+254, 254, or 07)
  - Email validation with regex
  - ID number format validation (5-10 digits)
  - Field length constraints
  - Enum validation for select fields (role, gender, employment status, relationship)
  - Detailed error messages for each validation rule

- ✅ **Advanced Search & Filtering**
  - Search by name, phone, or email (case-insensitive)
  - Filter by role (Member, Chairman, Secretary, etc.)
  - Filter by active/suspended status
  - Pagination with configurable page size

- ✅ **Member Operations**
  - Create new members with validation
  - Read member details with ledger
  - Update member information (with duplicate phone detection)
  - Soft suspend/reactivate members
  - Delete members (hard delete)
  - Get member statistics (total, active, suspended, total balance)

- ✅ **Data Integrity**
  - Unique phone number constraint at database level
  - Duplicate phone detection before insert/update
  - Automatic conversion of empty strings to null for optional fields
  - JSON storage for next-of-kin nominees

### Frontend Features (React + Vite)

- ✅ **Responsive Design**
  - Table view for desktop/tablet (columns: Name, Phone, Role, Balance, Status, Actions)
  - Card view for mobile and preferred layout
  - Toggle between table/card views
  - Mobile-first responsive approach
  - Readable fonts on all devices (14px minimum on mobile)

- ✅ **Search & Filtering**
  - Real-time search by name, phone, email
  - Role filter dropdown
  - Status filter (Active/Suspended)
  - Pagination controls with page info

- ✅ **Member Form**
  - Organized into 4 sections: Personal Info, Contact & Location, Employment, SACCO Info
  - Client-side validation matching backend rules
  - Real-time error feedback per field
  - Loading state during submission
  - Success/error messages with auto-dismiss
  - Proper handling of optional fields

- ✅ **User Experience**
  - Loading indicators
  - Empty state messages
  - Error alerts with clear messages
  - Confirmation dialogs for destructive actions (suspend/reactivate)
  - Smooth animations and transitions
  - Professional color scheme

- ✅ **Accessibility**
  - Semantic HTML
  - ARIA labels on interactive elements
  - Keyboard navigation support
  - Focus visible states
  - Reduced motion support

## 📦 API Endpoints

### List Members (with filtering & pagination)

```
GET /members?skip=0&take=50&search=james&role=Member&active=true&sort=desc
```

**Query Parameters:**
- `skip` (number): Records to skip (default: 0)
- `take` (number): Records to return per page (default: 50)
- `search` (string): Search by name, phone, or email
- `role` (string): Filter by role
- `active` (boolean): Filter by status (true/false)
- `sort` (string): Sort order - 'asc' or 'desc' (default: 'desc')

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "James Ngari",
      "phone": "0725338341",
      "email": "james@example.com",
      "role": "Member",
      "balance": 5000.00,
      "active": true,
      "createdAt": "2026-01-20T10:30:00.000Z",
      ...
    }
  ],
  "total": 45,
  "skip": 0,
  "take": 50,
  "pages": 1
}
```

### Create Member

```
POST /members
```

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "0725123456",
  "email": "john@example.com",
  "idNumber": "12345678",
  "dob": "1990-01-15",
  "gender": "Male",
  "physicalAddress": "P.O. Box 123",
  "town": "Nairobi",
  "employmentStatus": "Employed",
  "employerName": "ABC Corporation",
  "regNo": "REG123",
  "employerAddress": "Industrial Area, Nairobi",
  "role": "Member",
  "introducerName": "Jane Smith",
  "introducerMemberNo": "M001",
  "nextOfKin": [
    {
      "name": "Mary Doe",
      "relationship": "Spouse",
      "id": "98765432",
      "phone": "0725654321",
      "share": 100
    }
  ]
}
```

### Get Member Details

```
GET /members/:id
```

**Response:** Single member object with ledger relationship

### Update Member

```
PATCH /members/:id
```

**Request Body:** Any subset of member fields (all optional)

### Suspend Member

```
PATCH /members/:id/suspend
```

### Reactivate Member

```
PATCH /members/:id/reactivate
```

### Delete Member

```
DELETE /members/:id
```

### Get Member Statistics

```
GET /members/stats
```

**Response:**
```json
{
  "total": 45,
  "active": 42,
  "suspended": 3,
  "totalBalance": 125000.50
}
```

### Get Member Ledger

```
GET /members/:id/ledger
```

## 🔐 Validation Rules

### Phone Number
- Pattern: `^(\+254|254|0)[7-9]\d{8}$`
- Valid formats:
  - `0725338341` (local format)
  - `+254725338341` (international)
  - `254725338341` (alternative international)

### Email
- Standard email validation (optional field)
- Pattern: `^[^\s@]+@[^\s@]+\.[^\s@]+$`

### ID Number
- 5-10 digits only
- Pattern: `^\d{5,10}$`

### Date of Birth
- ISO 8601 format: `YYYY-MM-DD`
- Optional field

### Name Fields
- Minimum 2 characters
- Maximum 100 characters

### Role
- Enum: `Member`, `Chairman`, `Vice Chairman`, `Secretary`, `Treasurer`, `Admin`

### Employment Status
- Enum: `Employed`, `Self-Employed`, `Unemployed`, `Retired`, `Student`

### Gender
- Enum: `Male`, `Female`, `Other`

### Nominee Relationship
- Enum: `Spouse`, `Child`, `Parent`, `Sibling`, `Other`

### Nominee Share
- Must be > 0 and ≤ 100
- All nominees' shares must total 100% if nominees are provided

## 🎨 UI Components

### MembersList Component
- Main dashboard view with filters and search
- Table view for desktop
- Card view for mobile
- View type toggle
- Pagination controls
- Loading and empty states
- Error handling

### MemberForm Component
- New member registration
- Member editing
- Form validation with error display
- Section-based field organization
- Optional nominee management
- Submit state feedback

### membersAPI.js
- Axios wrapper with baseURL configuration
- Smart API URL detection (same-origin or cross-origin)
- Request/response interceptors
- Error handling
- All CRUD operation exports

## 📱 Responsive Breakpoints

| Device | Width | View |
|--------|-------|------|
| Phone | < 480px | Single column, card view, large touch targets |
| Tablet | 480px - 768px | 2-3 columns, card/table hybrid |
| Desktop | > 768px | Table view preferred, card view available |

### Mobile-First Approach
- Base styles for mobile (14px minimum font)
- Tablet enhancements at 768px
- Desktop enhancements at 1024px+
- Prevents zoom on iOS by using 16px for form inputs

## 🚀 Usage

### Frontend

```jsx
import MembersList from './components/members/MembersList';

// In your app routing
<Route path="/members" element={<MembersList />} />
```

### Backend

The module is automatically included via:
```typescript
// src/app.module.ts
import { MembersModule } from './members/members.module';

@Module({
  imports: [MembersModule, ...otherModules]
})
export class AppModule {}
```

## 🔧 Configuration

### Environment Variables

**Frontend (.env):**
```
VITE_API_URL=https://soyosoyo-reactapp-0twy.onrender.com
```

### Backend Features

**Pagination:**
- Default page size: 50 records
- Configurable via `take` parameter
- Maximum recommended: 100 records per page

**Search:**
- Case-insensitive
- Searches across name, phone, and email
- Uses Prisma's `contains` with `insensitive` mode

## 📊 Database Schema

### Member Table
- `id` (Int, primary key, auto-increment)
- `name` (String, required, max 100)
- `phone` (String, required, unique, max 20)
- `email` (String, optional, max 255)
- `idNumber` (String, optional, max 20)
- `dob` (DateTime, optional)
- `gender` (String, optional)
- `physicalAddress` (String, optional)
- `town` (String, optional)
- `employmentStatus` (String, optional)
- `employerName` (String, optional)
- `regNo` (String, optional)
- `employerAddress` (String, optional)
- `role` (String, required)
- `introducerName` (String, required)
- `introducerMemberNo` (String, required)
- `nextOfKin` (Json, optional)
- `balance` (Float, default: 0)
- `active` (Boolean, default: true)
- `createdAt` (DateTime, default: now())
- `updatedAt` (DateTime, auto-update)

### Ledger Table (related)
- Foreign key to Member with CASCADE delete
- Stores transaction history

## 🧪 Testing

### Manual Testing Checklist

**Create Member:**
- [ ] Register with all required fields
- [ ] Register with minimal fields (only required)
- [ ] Try duplicate phone number (should fail)
- [ ] Try invalid email (should fail)
- [ ] Try invalid phone (should fail)
- [ ] Try invalid ID number (should fail)

**Search & Filter:**
- [ ] Search by full name
- [ ] Search by phone number
- [ ] Search by email
- [ ] Filter by role
- [ ] Filter by active status
- [ ] Pagination works correctly

**Mobile Testing:**
- [ ] Card view loads on phone
- [ ] Filters accessible and usable
- [ ] Form inputs have proper font size (no zoom)
- [ ] Buttons clickable with fingers
- [ ] Responsive layout at 375px width

**Table View:**
- [ ] All columns visible and properly sized
- [ ] Data formatting correct (balance, dates)
- [ ] Action buttons work
- [ ] Sorting/filtering works

## 🐛 Common Issues

### Phone Number Validation
**Issue:** `0725338341` not accepted
**Solution:** The regex expects 8 digits after the prefix. Verify input format.

### Empty Optional Fields
**Issue:** Empty strings causing validation errors
**Solution:** The service automatically converts empty strings to null for optional DateTime fields.

### CORS Errors
**Solution:** Ensure `VITE_API_URL` points to the correct backend domain.

### Mobile Form Zoom
**Solution:** Input font size is set to 16px on mobile to prevent auto-zoom in iOS.

## 📈 Performance

- **Pagination:** Reduces query size to 50 records per page
- **Search:** Uses database-level case-insensitive search
- **Caching:** API responses can be cached per page
- **Lazy Loading:** Table view loads on demand via pagination

## 🔄 Integration with Other Modules

- **Dashboard:** Use `/members/stats` endpoint for overview metrics
- **Ledger:** Access via `/members/:id/ledger` endpoint
- **Auth:** Ready for JWT token integration via interceptors

## 📝 Future Enhancements

- [ ] Bulk import via CSV
- [ ] Member export to Excel/PDF
- [ ] Photo upload for member identification
- [ ] Activity audit log
- [ ] Email notifications for member events
- [ ] Member grouping by savings groups
- [ ] Advanced reporting and analytics

## 🤝 Contributing

To extend this module:

1. Add new fields to Prisma schema
2. Run: `npx prisma migrate dev`
3. Update DTOs with new validation rules
4. Update frontend form accordingly
5. Add new API endpoints as needed

## 📄 License

This module is part of the Soyosoyo SACCO system. All rights reserved.

---

**Last Updated:** January 20, 2026  
**Version:** 1.0.0 (Production Ready)
