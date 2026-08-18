# Bảng giá khách hàng lấy dữ liệu từ KiotViet

## Mục tiêu

Trang web này:
- đọc sản phẩm / giá / tồn kho từ KiotViet Public API
- không lộ Client Secret ra trình duyệt
- có ô tìm kiếm
- có chế độ chỉ hiện hàng còn tồn
- tự cập nhật mỗi 60 giây
- phù hợp deploy lên Vercel

KiotViet Public API dùng OAuth 2.0 với ClientId + Mã bảo mật; tài liệu chính thức cũng mô tả việc kết nối API từ gian hàng. 

## 1. Chuẩn bị bên KiotViet

Trong KiotViet, đăng nhập tài khoản admin và vào phần Thiết lập kết nối API.

Bạn cần 3 giá trị:

- Tên gian hàng / Retailer: `sieudidong`
- Client ID
- Mã bảo mật / Client Secret

KHÔNG đưa Client Secret vào app.js hoặc GitHub code công khai.

## 2. Deploy Vercel

Tạo một GitHub repository mới, ví dụ:

kiotviet-bao-gia

Upload toàn bộ:
- index.html
- styles.css
- app.js
- api/products.js
- vercel.json

Sau đó import repository đó vào Vercel.

## 3. Environment Variables trên Vercel

Project Settings -> Environment Variables

Thêm:

KIOTVIET_RETAILER
KIOTVIET_CLIENT_ID
KIOTVIET_CLIENT_SECRET

Sau đó Redeploy.

## 4. Domain

Có thể gắn:

banggia.sieudidong.vn

hoặc:

gia.sieudidong.vn

Vercel sẽ hướng dẫn CNAME cần tạo.

## 5. Lưu ý cấu trúc API

KiotViet có Public API phục vụ tích hợp website/CRM và hỗ trợ đối tượng Hàng hóa. Bộ code này đã tách phần bí mật sang API serverless, đúng hướng an toàn hơn so với gọi KiotViet trực tiếp từ trình duyệt.

Nếu API thực tế của gian hàng trả field khác một chút (ví dụ child products / inventories khác cấu trúc), chỉ cần chỉnh normalizeProduct() trong api/products.js.


## Cấu hình riêng cho gian hàng này

Retailer đã xác định là:

```text
sieudidong
```

Trên Vercel, tạo 3 Environment Variables:

```text
KIOTVIET_RETAILER=sieudidong
KIOTVIET_CLIENT_ID=<Client ID của bạn>
KIOTVIET_CLIENT_SECRET=<Mã bảo mật mới của bạn>
```

Không ghi Client Secret trực tiếp vào source code hoặc commit lên GitHub.


## Giao diện V2

Bản V2 nhóm các màu/dung lượng của cùng một model vào chung một khối để dễ xem hơn:
- 1 model = 1 card
- phiên bản màu/dung lượng nằm bên trong
- ô tìm kiếm sticky
- hiển thị số mẫu và số phiên bản
- mobile tối ưu 1 cột
- có thể thu gọn từng model


## Giao diện V3 - Có ảnh sản phẩm

KiotViet Public API có trường `images` là danh sách link hình ảnh sản phẩm.

Bản V3:
- lấy ảnh trực tiếp từ KiotViet API
- ưu tiên ảnh của phiên bản; nếu không có thì dùng ảnh sản phẩm cha
- ảnh lazy-load để giảm tải
- nếu sản phẩm không có ảnh thì hiện placeholder
- desktop ảnh 76x76, mobile 64x64
- vẫn giữ nhóm model, tìm kiếm, tồn kho và giá


## Giao diện V4 - Kiểu website

Thay đổi:
- giao diện dạng website/catalog sản phẩm
- card sản phẩm có ảnh lớn
- bỏ hoàn toàn mã sản phẩm khỏi giao diện
- tìm kiếm chỉ theo tên sản phẩm
- mỗi model là một card riêng
- các màu/dung lượng nằm gọn bên trong card
- mobile hiển thị dạng ảnh trái + thông tin phải


## Giao diện V5 - Thêm logo Siêu Di Động

Đã thêm 2 logo:
- `assets/logo-wide.jpg`: logo ngang dùng trên desktop.
- `assets/logo-square.jpg`: logo vuông dùng trên mobile, favicon và footer.

Upload toàn bộ thư mục `assets` cùng các file frontend.


## V6 - Ẩn sản phẩm ngừng kinh doanh

API KiotViet được gọi với:

`isActive=true`

Ngoài ra backend còn lọc thêm:

`p.isActive !== false`

Vì vậy các sản phẩm đã chuyển sang trạng thái ngừng kinh doanh trong KiotViet sẽ không xuất hiện trên website.
