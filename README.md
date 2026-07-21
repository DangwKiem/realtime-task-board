# Realtime Task Board

Ứng dụng quản lý công việc sử dụng **Next.js/React** ở frontend và **FastAPI** ở backend.

## Tính năng

- Đăng ký, đăng nhập và đăng xuất.
- Tạo, xem, sửa và xóa task.
- Tìm kiếm và lọc theo trạng thái.
- Mỗi người dùng chỉ xem được task của mình.
- Đồng bộ task giữa nhiều tab bằng WebSocket.
- Session đăng nhập được lưu trong Redis.

## Công nghệ

### Frontend

- Next.js
- React
- TypeScript

### Backend

- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- SQLite
- Redis
- WebSocket

## Kiến trúc

```text
Next.js / React
      │
      │ HTTP + JSON
      ▼
Uvicorn
      ▼
FastAPI
      │
      ├── SQLAlchemy ──► SQLite
      ├── Session ─────► Redis
      └── WebSocket ───► Các tab đang kết nối
```

## Cấu trúc chính

```text
realtime-task-board/
├── backend/
│   ├── app/
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    ├── package.json
    └── .env.local.example
```

## Yêu cầu

- Python 3.12+
- Node.js 20+
- npm
- Docker Desktop hoặc Redis cài trực tiếp

## 1. Chạy Redis

Dùng Docker:

```powershell
docker run `
  --name taskboard-redis `
  -p 6379:6379 `
  -d redis:7-alpine
```

Nếu container đã tồn tại:

```powershell
docker start taskboard-redis
```

Kiểm tra:

```powershell
docker exec taskboard-redis redis-cli ping
```

Kết quả:

```text
PONG
```

## 2. Cài đặt và chạy backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Tạo file `backend/.env`:

```env
APP_ENV=development

DATABASE_URL=sqlite:///./taskboard.db
REDIS_URL=redis://localhost:6379/0

FRONTEND_ORIGINS=http://localhost:3000

SESSION_COOKIE_NAME=taskboard_session
SESSION_IDLE_TTL_SECONDS=1800
SESSION_ABSOLUTE_TTL_SECONDS=28800
SESSION_SECURE=false

WEBSOCKET_HEARTBEAT_SECONDS=25
WEBSOCKET_MAX_MESSAGE_BYTES=4096
WEBSOCKET_MAX_CONNECTIONS_PER_USER=5
WEBSOCKET_SEND_TIMEOUT_SECONDS=3
```

Chạy backend:

```powershell
python -m uvicorn app.main:app `
  --reload `
  --host 127.0.0.1 `
  --port 8000 `
  --ws websockets
```

Kiểm tra:

```text
http://localhost:8000/api/health
http://localhost:8000/docs
```

## 3. Cài đặt và chạy frontend

Mở terminal mới:

```powershell
cd frontend
npm install
```

Tạo file `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/tasks
```

Chạy frontend:

```powershell
npm run dev
```

Mở:

```text
http://localhost:3000
```

Các trang chính:

```text
http://localhost:3000/register
http://localhost:3000/login
http://localhost:3000/tasks
```

## API chính

### Authentication

| Method | Endpoint |
|---|---|
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |

### Tasks

| Method | Endpoint |
|---|---|
| GET | `/api/tasks` |
| POST | `/api/tasks` |
| GET | `/api/tasks/{id}` |
| PATCH | `/api/tasks/{id}` |
| DELETE | `/api/tasks/{id}` |

## WebSocket

Endpoint:

```text
ws://localhost:8000/ws/tasks
```

Các event chính:

```text
task.created
task.updated
task.deleted
```

HTTP được dùng cho CRUD. WebSocket chỉ dùng để đồng bộ thay đổi giữa các tab.

## Kiểm tra dự án

Frontend:

```powershell
npm run lint
npm run build
```

Kiểm thử nhanh:

```text
1. Đăng ký tài khoản.
2. Đăng nhập.
3. Tạo, sửa và xóa task.
4. Mở hai tab /tasks.
5. Thay đổi task ở một tab.
6. Kiểm tra tab còn lại cập nhật không cần reload.
```

## Lỗi thường gặp

### Redis không chạy

```powershell
docker start taskboard-redis
docker exec taskboard-redis redis-cli ping
```

### Cookie không được gửi

Đảm bảo frontend và backend đều dùng `localhost`, không trộn với `127.0.0.1` trong URL trình duyệt.

Frontend phải có:

```typescript
credentials: "include"
```

### CORS error

Backend phải cho phép:

```text
http://localhost:3000
```

### Database cũ không đúng model

Dừng backend rồi xóa database development:

```powershell
Remove-Item .\taskboard.db
```

Sau đó chạy lại backend.

