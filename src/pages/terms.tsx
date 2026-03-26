import StaticPageLayout from '../components/layout/StaticPageLayout';

export default function TermsPage() {
    return (
        <StaticPageLayout title="Điều khoản sử dụng" description="Điều khoản và điều kiện sử dụng dịch vụ NemarkChat.">
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Điều khoản sử dụng</h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 40, fontSize: 14 }}>Cập nhật lần cuối: 22/03/2026</p>

            {[
                { title: '1. Chấp nhận điều khoản', content: 'Bằng việc truy cập và sử dụng NemarkChat, bạn đồng ý tuân thủ các điều khoản và điều kiện này. Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.' },
                { title: '2. Mô tả dịch vụ', content: 'NemarkChat cung cấp nền tảng live chat cho doanh nghiệp, bao gồm widget chat, quản lý hội thoại, phân quyền team, tích hợp đa kênh (Zalo, Facebook), analytics và các tính năng AI.' },
                { title: '3. Tài khoản người dùng', content: 'Bạn chịu trách nhiệm bảo mật thông tin tài khoản. Không chia sẻ mật khẩu với bất kỳ ai. Chúng tôi có quyền đình chỉ tài khoản nếu phát hiện vi phạm.' },
                { title: '4. Sử dụng hợp pháp', content: 'Bạn cam kết sử dụng dịch vụ đúng mục đích kinh doanh hợp pháp. Nghiêm cấm sử dụng để gửi spam, lừa đảo, phát tán nội dung vi phạm pháp luật hoặc gây hại cho người khác.' },
                { title: '5. Thanh toán và gói dịch vụ', content: 'Các gói có phí được tính theo chu kỳ hàng tháng hoặc hàng năm. Bạn có thể nâng/hạ cấp gói bất kỳ lúc nào. Phí đã thanh toán không được hoàn lại, trừ trường hợp đặc biệt.' },
                { title: '6. Quyền sở hữu trí tuệ', content: 'NemarkChat và các thành phần liên quan (thiết kế, mã nguồn, logo) thuộc sở hữu của Nemark Digital. Dữ liệu do bạn tạo ra trên hệ thống thuộc quyền sở hữu của bạn.' },
                { title: '7. Giới hạn trách nhiệm', content: 'Chúng tôi cam kết uptime 99.9% nhưng không chịu trách nhiệm cho các thiệt hại gián tiếp do gián đoạn dịch vụ, lỗi kỹ thuật hoặc các yếu tố ngoài tầm kiểm soát.' },
                { title: '8. Chấm dứt', content: 'Bạn có thể huỷ tài khoản bất kỳ lúc nào. Chúng tôi có quyền chấm dứt dịch vụ với thông báo trước 30 ngày trong trường hợp vi phạm nghiêm trọng.' },
                { title: '9. Thay đổi điều khoản', content: 'Chúng tôi có quyền thay đổi điều khoản và sẽ thông báo cho bạn qua email ít nhất 14 ngày trước khi thay đổi có hiệu lực.' },
            ].map((section) => (
                <section key={section.title} style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{section.title}</h2>
                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, fontSize: 15 }}>{section.content}</p>
                </section>
            ))}
        </StaticPageLayout>
    );
}
