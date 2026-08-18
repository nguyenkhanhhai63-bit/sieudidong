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


## V7 - Font cơ bản + phân loại sản phẩm

- Font toàn website chuyển về Arial / Helvetica / sans-serif để dễ đọc.
- Lấy danh sách Nhóm hàng trực tiếp từ KiotViet API `/categories`.
- Mỗi sản phẩm được gắn `categoryName` và nhóm cha `rootCategoryName`.
- Website tự tạo các nút lọc nhóm hàng từ dữ liệu KiotViet.
- Không cần tự gõ danh mục trong code.
- Vẫn chỉ lấy hàng đang kinh doanh (`isActive=true`).


## V9 - Lọc theo hãng điện thoại
Website tự nhận diện hãng từ tên sản phẩm để tạo bộ lọc:
Xiaomi (gồm Redmi/Poco), Apple, Samsung, OPPO (gồm OnePlus/realme),
vivo (gồm iQOO), HONOR, Huawei, Nubia/RedMagic, Motorola, Google, ASUS,
Sony, Nothing và Khác.

Không hiển thị thông tin KiotViet trên giao diện công khai.


## V10 - Hiển thị thuộc tính sản phẩm

- Tên sản phẩm hiển thị riêng.
- Thuộc tính của từng phiên bản hiển thị rõ:
  - Dung lượng
  - Màu sắc
- Ưu tiên lấy trực tiếp từ `attributes` của KiotViet.
- Nếu KiotViet không trả thuộc tính, website tự nhận diện từ tên phiên bản làm fallback.
- Mã sản phẩm vẫn không hiển thị.


## V11 - Bố cục kiểu trang chi tiết sản phẩm
- Ảnh sản phẩm bên trái.
- Tên máy và giá nổi bật bên phải.
- Màu sắc và dung lượng trình bày thành các lựa chọn.
- Tình trạng còn hàng đặt cạnh thông tin chính.
- Danh sách giá từng phiên bản nằm phía dưới.
- Mobile tự chuyển sang bố cục gọn hơn.


## V12 - Chọn màu/dung lượng tự đổi giá
- Bấm màu → tự chọn biến thể phù hợp và cập nhật giá.
- Bấm dung lượng → tự chọn biến thể phù hợp và cập nhật giá.
- Tổ hợp màu/dung lượng không tồn tại sẽ bị mờ và không bấm được.
- Khi đổi thuộc tính, tình trạng còn hàng cũng đổi theo đúng biến thể.
- Không cần reload trang.


## V13 - Ẩn thuộc tính của biến thể hết hàng
Khi bật "Chỉ hiện hàng còn tồn":
- Chỉ dùng các biến thể `onHand > 0` để tạo nút Màu sắc và Dung lượng.
- Màu/dung lượng chỉ tồn tại ở biến thể hết hàng sẽ không xuất hiện.
- Nếu một model không còn bất kỳ biến thể nào có hàng, ẩn luôn toàn bộ model.
- Giá và trạng thái chỉ lấy từ biến thể còn hàng.

Khi bỏ tick:
- Hiện lại đầy đủ cả biến thể hết hàng.


## V14 - Giao diện full width
- Desktop tăng chiều rộng nội dung lên tối đa 1560px.
- Màn hình rất rộng tăng lên tối đa 1760px.
- Card sản phẩm trải ngang, giảm khoảng trống 2 bên.
- Ảnh sản phẩm và khu vực thông tin được cân đối lại.
- Tablet/mobile vẫn responsive như cũ.


## V15 - Giao diện dạng shop/grid
- Desktop: 5 sản phẩm mỗi hàng giống trang thương mại điện tử.
- Ảnh lớn phía trên, tên sản phẩm, thuộc tính, giá, nút xem phiên bản.
- Bấm "XEM PHIÊN BẢN" để mở nhanh màu/dung lượng và đổi giá.
- Menu hãng dạng ngang.
- Responsive 4 / 3 / 2 cột tùy màn hình.


## V16 - Hiển thị đầy đủ màu và dung lượng
- Không còn chỉ hiển thị thuộc tính của biến thể mặc định.
- Card hiển thị tất cả màu còn hàng của sản phẩm.
- Card hiển thị tất cả dung lượng còn hàng của sản phẩm.
- Bấm màu hoặc dung lượng sẽ đổi giá theo đúng tổ hợp.
- Tổ hợp không tồn tại hoặc hết hàng sẽ tự ẩn.
- Nút "XEM PHIÊN BẢN" vẫn cho xem danh sách tất cả biến thể còn hàng.


## V17 - Vẫn hiển thị sản phẩm hết hàng
- Sản phẩm đang kinh doanh nhưng hết toàn bộ vẫn xuất hiện trên website.
- Card sẽ hiện trạng thái `Hết hàng`.
- Nếu sản phẩm còn ít nhất một biến thể có hàng và bật "Chỉ hiện hàng còn tồn":
  chỉ các biến thể còn hàng được hiển thị.
- Nếu sản phẩm hết toàn bộ:
  vẫn hiện card + thuộc tính/giá gần nhất để khách biết sản phẩm tồn tại, nhưng trạng thái là `Hết hàng`.
- Sản phẩm đã ngừng kinh doanh vẫn tiếp tục bị ẩn từ API.


## V18 - Màu dạng ô swatch
- Thuộc tính Màu không còn hiển thị bằng chữ trong từng nút.
- Mỗi màu là một ô màu trực quan.
- Màu đang chọn có viền cam + dấu tick.
- Tên màu đang chọn hiển thị dạng note bên cạnh, ví dụ `(Xanh)`.
- Dung lượng vẫn hiển thị bằng nút chữ như cũ.
- Bấm màu vẫn đổi đúng giá/biến thể.


## V19 - Luôn hiển thị đầy đủ
- Đã bỏ hoàn toàn checkbox `Chỉ hiện hàng còn tồn`.
- Website luôn hiển thị tất cả sản phẩm đang kinh doanh.
- Sản phẩm hết hàng vẫn xuất hiện và ghi `Hết hàng`.
- Các màu và dung lượng của sản phẩm hết hàng vẫn được giữ để khách xem.
- Sản phẩm đã ngừng kinh doanh vẫn được loại theo dữ liệu API.


## V21 - Mục Bán chạy mặc định
- Thêm mục `Bán chạy` và tự chọn mặc định khi khách mở website.
- Bán chạy được tính tự động từ số lượng bán trong hóa đơn 30 ngày gần nhất.
- Backend gọi API hóa đơn, cộng số lượng theo `productId`, chọn Top 20 biến thể bán nhiều nhất.
- Sản phẩm bán chạy có badge `BÁN CHẠY`.
- Khách vẫn có thể chuyển sang Tất cả hoặc các hãng điện thoại.
- Không hiển thị thông tin nguồn/API trên giao diện.


## V22 - Fix lỗi Bán chạy làm sập bảng giá
- Tính năng Bán chạy chỉ đọc tối đa 300 hóa đơn gần nhất trong 30 ngày.
- Nếu API hóa đơn lỗi hoặc quá chậm, website vẫn tải toàn bộ bảng giá bình thường.
- Nếu không lấy được dữ liệu bán chạy thì tab Bán chạy tự ẩn và mặc định chuyển sang Tất cả.
- Khi API hóa đơn hoạt động bình thường, Bán chạy vẫn là tab mặc định.


## V23 - Fix dứt điểm lỗi tải bảng giá
- Đã bỏ hoàn toàn việc gọi API hóa đơn khỏi `/api/products`.
- Bảng giá chỉ còn gọi API sản phẩm + nhóm hàng như bản ổn định trước đó.
- Mục `Bán chạy` được quản lý bằng file `bestsellers.js`.
- Có thể sửa danh sách tên máy bán chạy ngay trong `bestsellers.js`.
- Nếu danh sách không khớp/để trống, website tự lấy 12 mẫu đầu tiên để mục Bán chạy không bị rỗng.
- `Bán chạy` vẫn là tab mặc định khi khách vào web.


## V24 - API ổn định
- Bỏ hoàn toàn API nhóm hàng `/categories`; web phân hãng trực tiếp từ tên sản phẩm nên không cần gọi endpoint phụ.
- `/api/products` chỉ còn lấy sản phẩm, tồn kho, giá, ảnh và thuộc tính.
- Backend giữ dữ liệu thành công gần nhất trong bộ nhớ và trả lại nếu KiotViet lỗi tạm thời.
- Frontend lưu bảng giá gần nhất vào localStorage.
- Refresh API lỗi sẽ không còn xóa bảng đang hiển thị.
- Nếu mở web lúc API lỗi, trình duyệt sẽ dùng dữ liệu gần nhất đã lưu.
- Bán chạy vẫn dùng `bestsellers.js`, không gọi API hóa đơn.


## V25 - Fix lỗi render không hiện sản phẩm
Nguyên nhân:
- `render()` vẫn gọi `colorHex(color)` để vẽ ô màu.
- Trong bản V24, helper `colorHex()` bị thiếu.
- JavaScript dừng ngay sau khi cập nhật số lượng sản phẩm, nên màn hình hiện số mẫu nhưng không render card.

Bản V25 khôi phục `colorHex()` và giữ nguyên API ổn định của V24.
