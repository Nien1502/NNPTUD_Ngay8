var express = require("express");
var router = express.Router();
let { uploadExcel, uploadImage } = require('../utils/uploadHandler')
let path = require('path')
let excelJs = require('exceljs')
let categoriesModel = require('../schemas/categories')
let productsModel = require('../schemas/products')
let inventoriesModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')

let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let { sendMail } = require('../utils/mailHandler')
let { CreateAnUser } = require('../controllers/users')

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files', 5), function (req, res, next) {
    console.log(req.body);
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workBook = new excelJs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workBook.xlsx.readFile(pathFile)
    let worksheet = workBook.worksheets[0];
    let categories = await categoriesModel.find({})
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category.id);
    }
    let getProducts = await productsModel.find({})
    let getSKU = getProducts.map(p => p.sku)
    let getTitle = getProducts.map(p => p.title)
    let result = [];
    for (let index = 2; index <= worksheet.rowCount; index++) {
        let rowError = [];
        const row = worksheet.getRow(index)
        let sku = row.getCell(1).value;
        let title = row.getCell(2).value;
        let category = row.getCell(3).value;
        let price = Number.parseInt(row.getCell(4).value);
        let stock = Number.parseInt(row.getCell(5).value);

        if (price < 0 || isNaN(price)) {
            rowError.push("price phai la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowError.push("stock phai la so duong")
        }
        if (!categoriesMap.has(category)) {
            rowError.push("category khong hop le")
        }
        if (getSKU.includes(sku)) {
            rowError.push("sku da ton tai")
        }
        if (getTitle.includes(title)) {
            rowError.push("title da ton tai")
        }
        if (rowError.length > 0) {
            result.push({
                success: false,
                data: rowError
            })
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productsModel({
                sku: sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-',
                    remove: undefined,
                    lower: true,
                    strict: true
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category),
            })
            await newProduct.save({ session })
            let newInventory = new inventoriesModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session })
            await newInventory.populate('product')
            await session.commitTransaction();
            await session.endSession()
            result.push({
                success: true,
                data: newInventory
            })
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push({
                success: false,
                data: error.message
            })
        }
    }
    res.send(result)
})
module.exports = router;

// Import user từ file Excel
router.post('/import-users', uploadExcel.single('file'), async function (req, res, next) {
    let excelJs = require('exceljs');
    let workBook = new excelJs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename);
    await workBook.xlsx.readFile(pathFile);
    let worksheet = workBook.worksheets[0];
    // Lấy role user
    let userRole = await roleModel.findOne({ name: 'user' });
    if (!userRole) {
        return res.status(400).send({ error: 'Role user không tồn tại' });
    }
    let result = [];
    for (let index = 2; index <= worksheet.rowCount; index++) {
        let row = worksheet.getRow(index);
        // Lấy giá trị thực tế nếu là object (công thức Excel)
        let getCellValue = (cell) => {
            if (cell && typeof cell.value === 'object' && cell.value !== null) {
                // Nếu là object có công thức, lấy .result
                return cell.value.result || '';
            }
            return cell.value || '';
        };
        let username = getCellValue(row.getCell(1));
        let email = getCellValue(row.getCell(2));
        // Kiểm tra trùng username/email
        let existedUser = await userModel.findOne({ $or: [{ username }, { email }] });
        if (existedUser) {
            result.push({
                success: false,
                username,
                email,
                error: 'Username hoặc email đã tồn tại'
            });
            continue;
        }
        // Sinh password ngẫu nhiên 16 ký tự
        let password = Array(16).fill(0).map(() => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            return chars.charAt(Math.floor(Math.random() * chars.length));
        }).join('');
        // Tạo user mới (không dùng transaction/session)
        try {
            let newUser = await CreateAnUser(
                username,
                password,
                email,
                userRole._id,
                undefined, // không truyền session
                '', // fullname
                undefined, // avatarUrl
                false, // status
                0 // loginCount
            );
            // Gửi email password cho user
            try {
                await sendMail(email, password);
                console.log(`Đã gửi mail cho ${email}`);
            } catch (mailErr) {
                console.error(`Gửi mail cho ${email} thất bại:`, mailErr);
                result.push({
                    success: false,
                    username,
                    email,
                    error: 'Tạo user thành công nhưng gửi email thất bại',
                    mailError: mailErr.message
                });
                continue;
            }
            result.push({
                success: true,
                username,
                email
            });
        } catch (err) {
            result.push({
                success: false,
                username,
                email,
                error: err.message
            });
        }
    }
    res.send(result);
});