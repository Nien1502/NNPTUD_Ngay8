const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io", // Đúng host Mailtrap cung cấp
    port: 2525,
    secure: false,
    auth: {
        user: "bfbd29580c6c27",
        pass: "1adaaa72c0f328",
    },
});
module.exports = {
    // Gửi email với nội dung password rõ ràng
    sendMail: async function (to, password) {
        try {
            const info = await transporter.sendMail({
                from: 'no-reply@example.com',
                to: to,
                subject: "Tài khoản mới và mật khẩu đăng nhập",
                text: `Chào bạn!\n\nTài khoản của bạn đã được tạo thành công.\nMật khẩu đăng nhập của bạn là: ${password}\n\nVui lòng đổi mật khẩu sau khi đăng nhập.`,
                html: `<p>Chào bạn!</p><p>Tài khoản của bạn đã được tạo thành công.</p><p><b>Mật khẩu đăng nhập của bạn là: <span style='color:blue;'>${password}</span></b></p><p>Vui lòng đổi mật khẩu sau khi đăng nhập.</p>`
            });
            console.log("Message sent:", info.messageId);
        } catch (err) {
            console.error("Gửi mail thất bại:", err);
            throw err;
        }
    }
}
