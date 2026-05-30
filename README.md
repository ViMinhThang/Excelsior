# Excelsior

Excelsior là trợ lý lập trình AI chạy trong terminal, dùng DeepSeek và giao diện TUI bằng Ink. Dự án được tổ chức theo dạng npm workspaces với các package dùng chung, app TUI và app desktop.

## Yêu cầu

- Node.js và npm
- Git
- Ripgrep (`rg`) nếu muốn công cụ tìm kiếm file hoạt động nhanh và đúng như thiết kế

## Cài đặt dự án

Clone repository rồi cài dependencies:

```powershell
git clone <repository-url>
cd Excelsior
npm install
```

Nếu bạn đã có source code sẵn, chỉ cần mở thư mục dự án và chạy:

```powershell
npm install
```

## Cấu hình

Excelsior cần DeepSeek API key để chạy trợ lý AI.

Trên PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="your-deepseek-api-key"
```

Token GitHub là tùy chọn, chỉ cần khi dùng tính năng review pull request:

```powershell
$env:GITHUB_TOKEN="your-github-token"
```

Bạn cũng có thể mở màn hình Settings trong app bằng `Ctrl+S` hoặc lệnh `/settings` để lưu key trực tiếp trong ứng dụng.

Các biến môi trường hữu ích:

| Biến | Bắt buộc | Mục đích |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Có | API key để gọi DeepSeek |
| `GITHUB_TOKEN` | Không | Dùng cho tính năng review PR |
| `EXCELSIOR_DB_PATH` | Không | Đổi vị trí SQLite database |
| `EXCELSIOR_SESSIONS_DIR` | Không | Đổi thư mục lưu session JSONL |
| `EXCELSIOR_RIPGREP_PATH` | Không | Chỉ định đường dẫn `rg` tùy chỉnh |

## Chạy ứng dụng

Chạy TUI trong terminal:

```powershell
npm run dev
```

Hoặc dùng script tương đương:

```powershell
npm run dev:tui
```

Chạy app desktop:

```powershell
npm run dev:desktop
```

Sau khi build, có thể chạy bản TUI đã biên dịch:

```powershell
npm run build
npm start
```

## Lệnh phát triển

| Lệnh | Công dụng |
| --- | --- |
| `npm run dev` | Chạy app TUI ở chế độ development |
| `npm run dev:desktop` | Chạy app desktop ở chế độ development |
| `npm test` | Chạy toàn bộ test bằng Vitest |
| `npm run test:watch` | Chạy test ở chế độ watch |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build toàn bộ dự án |
| `npm run check` | Chạy typecheck, kiểm tra unused, test và build |

## Lệnh trong Excelsior

| Lệnh | Mô tả |
| --- | --- |
| `/help` | Xem danh sách lệnh |
| `/clear` | Xóa nội dung chat đang hiển thị |
| `/reset` | Xóa lịch sử hội thoại |
| `/revert` | Hoàn tác thay đổi file của lượt gần nhất |
| `/settings` | Mở màn hình Settings |
| `/review <number>` | Lấy diff của PR và chạy review bằng nhiều agent |
| `/review-post <number> <body>` | Đăng comment vào PR |
| `/session` | Mở danh sách session |

## Phím tắt

| Phím | Hành động |
| --- | --- |
| `Ctrl+S` | Mở Settings |
| `Ctrl+C` | Thoát ứng dụng |
| `Ctrl+O` | Bật/tắt chi tiết sub-agent |
| `Esc` | Hủy agent đang chạy hoặc quay lại |
| `Up` / `Down` | Di chuyển trong lịch sử tin nhắn hoặc gợi ý |
| `Tab` | Hoàn thành gợi ý lệnh hoặc chuyển field trong Settings |

## Cấu trúc thư mục

```text
packages/
|- core/           # shared domain and view contracts
|- client/         # host client contract and client-side helpers
|- projection/     # deterministic projection/read-model primitives
|- run-runtime/    # run lifecycle, event, subscription, orchestration
`- agent-host/     # local backend, persistence, tools, commands

apps/
|- tui/            # app terminal bằng Ink
`- desktop/        # app desktop bằng Electron/Vite

src/
`- __tests__/      # cross-repo architecture boundary tests
```

Package and app unit tests live beside their owners under `packages/*/__tests__` and `apps/*/__tests__`.

## Xử lý lỗi thường gặp

- Thiếu `DEEPSEEK_API_KEY`: cấu hình biến môi trường hoặc vào `Ctrl+S` / `/settings`.
- Lỗi GitHub PR review: cấu hình `GITHUB_TOKEN` có quyền truy cập repository.
- Lỗi dependency: xóa `node_modules`, sau đó chạy lại `npm install`.

## License

ISC
