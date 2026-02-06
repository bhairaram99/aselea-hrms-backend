# HRMS Backend API

Backend API for HRMS (Human Resource Management System) with location tracking functionality.

## Features

- 🔐 JWT Authentication
- 📍 Live Location Tracking (Google Maps API)
- 👥 User Management (Admin, HR, Employee)
- 🏢 Company Management
- ✅ Attendance Tracking with Location
- 📝 Leave Management
- 📋 Task Management with File Uploads
- 💰 Expense Management
- 💬 Real-time Chat (Socket.io)
- 📢 Announcements

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in root directory and add your configuration:
```bash
cp .env.example .env
```

3. Update `.env` with your actual credentials:
- MongoDB connection string
- JWT secret
- Cloudinary credentials
- Gmail SMTP credentials
- Google Maps API key

4. Start MongoDB (if using local):
```bash
mongod
```

5. Run the server:
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Environment (development/production) |
| `PORT` | Server port (default: 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT tokens |
| `JWT_EXPIRE` | JWT expiration time |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `EMAIL_HOST` | SMTP host (smtp.gmail.com) |
| `EMAIL_PORT` | SMTP port (587) |
| `EMAIL_USER` | Email address |
| `EMAIL_PASSWORD` | Email app password |
| `FRONTEND_URL` | Frontend URL for CORS |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key for location tracking |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with location tracking
- `POST /api/auth/register` - Register new user (Admin/HR only)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/login-history/:userId` - Get login history
- `PUT /api/auth/update-location` - Update current location

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Companies
- `GET /api/companies` - Get all companies
- `POST /api/companies` - Create company
- `GET /api/companies/:id` - Get company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/check-in` - Check in
- `POST /api/attendance/check-out` - Check out
- `GET /api/attendance/my-attendance` - Get my attendance

### Leaves
- `GET /api/leaves` - Get leave requests
- `POST /api/leaves` - Create leave request
- `PUT /api/leaves/:id/approve` - Approve leave
- `PUT /api/leaves/:id/reject` - Reject leave

### Tasks
- `GET /api/tasks` - Get tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `PUT /api/tasks/:id/progress` - Update task progress
- `DELETE /api/tasks/:id` - Delete task

### Expenses
- `GET /api/expenses` - Get expenses
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id/approve` - Approve expense
- `PUT /api/expenses/:id/reject` - Reject expense

### Chat
- `GET /api/chat/conversations` - Get conversations
- `GET /api/chat/messages/:userId` - Get messages with user
- `POST /api/chat/send` - Send message

### Announcements
- `GET /api/announcements` - Get announcements
- `POST /api/announcements` - Create announcement
- `PUT /api/announcements/:id` - Update announcement
- `DELETE /api/announcements/:id` - Delete announcement

## Location Tracking

The system tracks user location during login using:

1. **GPS Location (Primary)**: Frontend sends latitude/longitude
2. **Google Maps API**: Converts coordinates to human-readable address
3. **IP Geolocation (Fallback)**: Uses geoip-lite when GPS unavailable

### Login History Schema
```javascript
{
  loginTime: Date,
  logoutTime: Date,
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    city: String,
    country: String,
    ipAddress: String
  },
  device: {
    userAgent: String,
    browser: String,
    os: String
  }
}
```

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + bcryptjs
- **File Storage**: Cloudinary
- **Real-time**: Socket.io
- **Email**: Nodemailer (Gmail SMTP)
- **Location**: Google Maps API, geoip-lite
- **Security**: Helmet, express-mongo-sanitize, xss-clean, express-rate-limit

## Security Features

- Password hashing with bcryptjs
- JWT token authentication
- MongoDB injection prevention
- XSS attack prevention
- Rate limiting
- CORS configuration
- Helmet security headers

## License

ISC
