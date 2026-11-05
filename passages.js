/* Danh sách bài đọc hiển thị ở trang chủ.
   Thêm một bài mới = thêm một dòng vào mảng này (và upload file HTML của bài lên cùng thư mục).

   id     : mã ngắn, chỉ gồm chữ thường, số, gạch ngang (a-z 0-9 -). KHÔNG đổi sau khi đã có người làm,
            vì lịch sử được gom theo id này. Phải trùng với id gửi đi trong file của bài.
   title  : tên bài hiển thị.
   topic  : chủ đề (hiện thành nhãn nhỏ).
   q      : khoảng câu hỏi, ví dụ "Questions 27–40".
   file   : tên file HTML của bài. Để null nếu bài chưa sẵn sàng (thẻ sẽ hiện "Sắp có"). */
window.RD_PASSAGES = [
  { id: "deception",      title: "The Art of Deception",                       topic: "Psychology", q: "Questions 27–40", file: "deception.html" },
  { id: "children-lit",   title: "Children’s Literature Studies Today",        topic: "Literature", q: "Questions 27–40", file: null },
  { id: "nanotech",       title: "Nanotechnology: the science of the very small", topic: "Science", q: "Questions 27–40", file: null },
  { id: "life-on-mars",   title: "Life on Mars?",                              topic: "Science",    q: "Questions 27–40", file: null },
  { id: "patient-safety", title: "Improving Patient Safety",                   topic: "Health",     q: "Questions 27–40", file: null }
];
