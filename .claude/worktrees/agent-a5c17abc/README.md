# Nemark Live Chat

## Architecture & Rules

### A. FRONTEND – NEXT.JS (Pages Router)

#### A1) Cấu trúc thư mục (GIỮ NGUYÊN, không đổi)
```text
src/
├── pages/                               # Pages Router (routing trung tâm)
│   ├── _app.tsx
│   ├── _document.tsx
│   ├── index.tsx
│   ├── auth/
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── verify-email.tsx
│   ├── listing/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   ├── workspace/
│   │   ├── index.tsx
│   │   ├── create.tsx
│   │   └── [workspaceId]/
│   │       ├── index.tsx
│   │       ├── inbox.tsx
│   │       ├── settings.tsx
│   │       └── teams.tsx
│   ├── admin/
│   │   ├── index.tsx
│   │   ├── listings.tsx
│   │   └── reports.tsx
│   ├── profile/
│   │   └── index.tsx
│   └── widget.tsx
│
├── features/                            # Flow theo màn hình (UI orchestration)
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── validators/
│   │   └── index.ts
│   ├── listing/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   ├── workspace/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   ├── inbox/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   └── admin/
│       ├── components/
│       ├── hooks/
│       └── index.ts
│
├── domains/                             # Nghiệp vụ cốt lõi (model + query hooks)
│   ├── auth/
│   │   ├── auth.types.ts
│   │   ├── auth.api.ts                  # domain adapter (KHÔNG axios)
│   │   ├── auth.keys.ts
│   │   ├── auth.hooks.ts                # gọi services/*
│   │   └── index.ts
│   ├── listing/
│   │   ├── listing.types.ts
│   │   ├── listing.api.ts               # domain adapter (KHÔNG axios)
│   │   ├── listing.keys.ts
│   │   ├── listing.hooks.ts             # gọi services/*
│   │   ├── listing.mappers.ts
│   │   └── index.ts
│   ├── seller/
│   ├── category/
│   ├── report/
│   └── admin/
│
├── components/                          # Shared UI (không phụ thuộc domain)
│   ├── ui/
│   ├── layout/
│   ├── feedback/
│   └── index.ts
│
├── providers/                           # App-level providers
│   ├── AppProviders.tsx
│   ├── QueryProvider.tsx
│   ├── AuthProvider.tsx
│   └── NotificationProvider.tsx
│
├── contexts/                            # Global state (ít, rõ, không business phức tạp)
│   ├── ConversationContext.tsx
│   ├── NotificationContext.tsx
│   └── index.ts
│
├── lib/                                 # Infra / third-party setup
│   ├── http/
│   │   ├── client.ts                    # axios instance
│   │   ├── interceptors.ts
│   │   └── error.ts
│   ├── react-query/
│   │   ├── queryClient.ts
│   │   └── options.ts
│   ├── socket/
│   │   └── client.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   └── constants.ts
│
├── services/                            # NƠI DUY NHẤT gọi HTTP (axios)
│   ├── upload.service.ts
│   └── email.service.ts
│
├── types/
│   ├── common.ts
│   ├── user.ts
│   └── index.ts
│
├── utils/
│   ├── format.ts
│   ├── storage.ts
│   └── index.ts
│
├── config/
│   ├── env.ts
│   ├── permissions.ts
│   └── routes.ts
│
└── styles/
    └── globals.css
```

#### A2) Trách nhiệm từng tầng (Separation of Concerns)

**1) pages/ (Routing-only)**
- Chỉ làm routing, không xử lý nghiệp vụ.
- Không gọi API, không import axios/service/hook/domain.
- Chỉ import 1 “Page Container” từ `features/*` và (nếu cần) layout từ `components/layout`.
- Page chỉ làm: đọc query/params từ Next router, render feature container với props cơ bản (id, mode…), set SEO/head nếu dự án có quy ước.
- *Lưu ý: rule đúng là pages chỉ import từ features/* và components/layout.*

**2) features/ (UI orchestration theo màn hình)**
- Chứa container component cho từng màn hình/flow.
- Được phép: dùng hooks (ở `features/*/hooks` hoặc `domains/*/*.hooks.ts`), ghép nhiều shared UI component / feature UI component.
- Không được: gọi axios trực tiếp, nhét business rules “cốt lõi” (phải nằm trong domain/service).

**3) components/ (Shared UI)**
- Chỉ render UI, không gọi API, không import services/, không import domains/.
- Không phụ thuộc feature/domain.
- Dùng Tailwind cho layout/spacing. Ant Design dùng cho component phức tạp theo rule UI (mục A5).

**4) hooks/ + features/*/hooks/ + domains/*/*.hooks.ts (Logic-only)**
- Hook không render JSX.
- Hook được phép gọi: `services/*` (HTTP), `domains/*` (types, keys, mappers).
- Hook chịu trách nhiệm: orchestration logic (pagination, debounce, permission, socket sync), mapping dữ liệu cho UI (không biến hook thành UI).

**5) services/ (HTTP-only)**
- NƠI DUY NHẤT được phép dùng axios để gọi API.
- Không xử lý UI. Không chứa logic UI/form.
- Business logic “cốt lõi” không đặt ở đây. Tập trung vào: request/response transport, typing request/response, chuẩn hoá lỗi (throw typed error).

**6) domains/ (Business model + domain hooks)**
- Chứa:
  - `*.types.ts`: model/type
  - `*.keys.ts`: react-query keys
  - `*.mappers.ts`: map/normalize DTO → model
  - `*.hooks.ts`: react-query hooks gọi services/
  - `*.api.ts`: domain adapter (KHÔNG gọi axios, chỉ gọi hàm trong `services/*` + mapping/typing)
- Mục tiêu: domain là “hợp đồng nghiệp vụ” (types + rules mapping + query keys), giúp scale.

**7) providers/ và contexts/**
- `providers/`: wrapper lắp Query/Auth/Notification vào `_app.tsx`.
- `contexts/`: chỉ quản lý global state nhẹ (auth status, notification list, conversation state realtime…). Không chứa business logic phức tạp.

**8) lib/, utils/, types/, config/**
- `lib/`: setup third-party (axios instance, interceptors, queryClient, socket client, i18n).
- `utils/`: hàm thuần (format/storage), không đụng React.
- `types/`: cross-domain types (Pagination, ApiResponse…).
- `config/`: env/permission/routes constants, không hardcode URL.

#### A3) Luồng import (Dependency Rules)
- Mục tiêu: import 1 chiều, không vòng lặp.
- `pages/*` → chỉ import `features/*` và `components/layout`
- `features/*` → import `hooks/*`, `domains/*`, `components/*`
- `components/*` → chỉ import `utils/*`, `types/*` (không import domains/services)
- `domains/*` → import `services/*`, `types/*`, `utils/*`, `lib/react-query` (nếu cần)
- `services/*` → import `lib/http/*`, `config/*`, `types/*`
- `lib/*` → import `config/*`

#### A4) Next.js rules (BẮT BUỘC)
- **Link**: luôn dùng `next/link`, không dùng `<a>` cho routing nội bộ.
- **Image**: luôn dùng `next/image` cho ảnh tĩnh/remote.
- **SSR safety**: không dùng window/document nếu chưa check `typeof window !== 'undefined'`.
- **Component nặng**: dùng `next/dynamic` (và `ssr: false` nếu phụ thuộc browser APIs).
- **Không hardcode URL**: lấy từ `config/env.ts` hoặc `config/routes.ts`.

#### A5) UI rules (Tailwind + Ant Design)
- **Tailwind**: layout, spacing, grid/flex, responsive, typography, color tokens.
- **Ant Design**: component phức tạp và đúng thế mạnh (Form, Modal, Table, Drawer, Dropdown, DatePicker, Upload, Notification/Message…).
- **Không “bọc chồng chéo vô nghĩa”**: Tailwind chỉ chỉnh layout quanh AntD, không “đánh nhau” với CSS nội bộ AntD.

#### A6) TypeScript & code style
- Không dùng `any`. Hạn chế `unknown`.
- File/component naming rõ nghĩa, thống nhất PascalCase/kebab-case theo convention dự án.
- Mỗi file 1 trách nhiệm, không gộp routing + logic + API.

### B. BACKEND GLOBAL RULES (PRODUCTION)

#### 0) NGUYÊN TẮC CHUNG
- TUYỆT ĐỐI không thay đổi cấu trúc thư mục hiện tại. Không đề xuất kiến trúc mới.
- Chỉ tạo/chỉnh sửa file cần thiết theo yêu cầu. Không tạo file/logic không dùng.
- Mỗi file 1 trách nhiệm. Không gộp controller + service, không gộp route + logic.
- Không hardcode config/secret/URL. Tất cả lấy từ env/config.
- Không try/catch tràn lan. Dùng error handler tập trung.
- Validate input mọi endpoint. Không tin request từ client.
- Không log thông tin nhạy cảm (password, token).

#### 1) CẤU TRÚC BẮT BUỘC (KHÔNG ĐỔI)
```text
src/
├─ bootstrap/
├─ config/
├─ infra/
├─ middlewares/
├─ modules/
│  └─ <domain>/
│     ├─ repos/
│     ├─ *.controller.js
│     ├─ *.service.js
│     ├─ *.routes.js
│     └─ *.validate.js
└─ routes.js
```

#### 2) LUỒNG XỬ LÝ BẮT BUỘC
- HTTP: `Request → Middleware(auth/validate/...) → Controller → Service → Repo → Service → Controller → Response`
- Socket (nếu có): `Socket → Service → Repo`
- Không được phá vỡ luồng này: Không query DB trong controller/middleware. Không xử lý business logic trong routes.

#### 3) QUY TẮC CHO TỪNG PHẦN
- **routes.js (root router)**: Chỉ mount các module routes và global middlewares cần thiết. Không chứa nghiệp vụ.
- **modules/<domain>/*.routes.js (Route layer)**: Chỉ khai báo endpoint + thứ tự middleware.
- **modules/<domain>/*.validate.js (Validation layer)**: Chỉ định nghĩa validator cho request (body/query/params).
- **middlewares/ (Middleware layer)**: Chỉ làm cross-cutting concerns (auth, authorize, validate adapter, rate limit, logging, error handling).
- **modules/<domain>/*.controller.js (Controller layer)**: Nhận req, lấy dữ liệu đã validate (req.validated), gọi service, trả response. KHÔNG truy cập DB trực tiếp.
- **modules/<domain>/*.service.js (Service layer)**: Chứa business logic, rule nghiệp vụ, orchestration. Gọi repo.
- **modules/<domain>/repos/* (Repository layer)**: Chỉ làm việc với DB. Không xử lý business logic.
- **infra/ (Infrastructure layer)**: DB client/connection, security helpers, logger, error classes, third-party wrappers.
- **config/ (Config layer)**: Đọc env và export config object.
- **bootstrap/ (Bootstrap layer)**: Tạo Express app, gắn middlewares global, mount routes, start server.

#### 4) ERROR HANDLING (BẮT BUỘC)
- Có error handler tập trung ở `middlewares/errorHandler`.
- Controller/service throw error; middleware bắt và trả response.
- Không leak stack trace ở production.
- Mọi lỗi phải có code (vd: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND).

#### 5) SECURITY (BẮT BUỘC)
- Password: bcrypt hash + compare (infra/security).
- JWT: có expires, verify ở middleware auth.
- Không trả các field nhạy cảm (passwordHash, refreshToken, secrets).
- Validate input mọi endpoint (body/query/params).

#### 6) OUTPUT REQUIREMENTS (KHI AI TRẢ LỜI)
Luôn theo thứ tự:
1. Danh sách file sẽ tạo/chỉnh sửa
2. Luồng xử lý ngắn theo kiến trúc
3. Code đúng file đúng trách nhiệm
4. Không giải thích lan man.

#### CẤM TUYỆT ĐỐI
- Không đổi cấu trúc thư mục.
- Không query DB trong controller.
- Không xử lý business logic trong route.
- Không gộp controller + service.
- Không tạo file/logic không dùng.
