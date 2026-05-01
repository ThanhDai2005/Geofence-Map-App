const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

const uri = "mongodb+srv://dai2272005nv_db_user:0oYm0PLvXdCcNXHV@cluster0.ztr2ufd.mongodb.net/vngo_travel";

async function main() {
    console.log("==========================================");
    console.log("🚀 Bắt đầu quá trình Import tự động lên MongoDB Atlas...");
    console.log("==========================================\n");

    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log("✅ Đã kết nối thành công tới Database!");
        const db = client.db("vngo_travel");

        const mongoDir = path.join(__dirname);
        const files = fs.readdirSync(mongoDir).filter(f => f.endsWith('.json') && f.startsWith('vngo_travel.'));

        let successCount = 0;
        let skipCount = 0;

        for (const file of files) {
            const collectionName = file.replace('vngo_travel.', '').replace('.json', '');
            const filePath = path.join(mongoDir, file);

            console.log(`\n📦 Đang xử lý bảng: [${collectionName}]`);

            const content = fs.readFileSync(filePath, 'utf8');
            if (!content.trim() || content.trim() === '[]') {
                console.log(`  -> Bỏ qua: File trống hoặc không có dữ liệu (sẽ được tự tạo khi hệ thống chạy)`);
                skipCount++;
                continue;
            }

            let data;
            try {
                // Sử dụng EJSON để parse các kiểu dữ liệu đặc biệt của MongoDB như $oid, $date
                data = EJSON.parse(content);
            } catch (e) {
                console.log(`  -> ❌ Lỗi đọc file JSON: ${e.message}`);
                continue;
            }

            if (!Array.isArray(data)) {
                data = [data];
            }

            if (data.length === 0) {
                console.log(`  -> Bỏ qua: 0 records`);
                skipCount++;
                continue;
            }

            // Xóa collection cũ để import dữ liệu mới sạch sẽ (clean slate)
            try {
                await db.collection(collectionName).drop();
                console.log(`  -> Đã xóa dữ liệu cũ`);
            } catch(e) {
                // Bỏ qua lỗi nếu collection chưa tồn tại
            }

            // Insert dữ liệu mới
            try {
                const result = await db.collection(collectionName).insertMany(data);
                console.log(`  -> ✅ Thành công: Đã thêm ${result.insertedCount} dòng dữ liệu`);
                successCount++;
            } catch (e) {
                console.log(`  -> ❌ Lỗi khi thêm dữ liệu: ${e.message}`);
            }
        }

        console.log("\n==========================================");
        console.log(`🎉 HOÀN THÀNH IMPORT!`);
        console.log(`- Import thành công: ${successCount} bảng`);
        console.log(`- Bỏ qua (bảng rỗng): ${skipCount} bảng`);
        console.log("==========================================");

    } catch (err) {
        console.error("❌ Lỗi nghiêm trọng:", err);
    } finally {
        await client.close();
    }
}

main();