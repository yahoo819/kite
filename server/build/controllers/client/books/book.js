"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const models = require('../../../../../db/mysqldb/index');
const moment_1 = __importDefault(require("moment"));
const { resClientJson } = require('../../../utils/resData');
const Op = require('sequelize').Op;
const cheerio = require('cheerio');
const clientWhere = require('../../../utils/clientWhere');
const xss = require('xss');
const config = require('../../../../../config');
const lowdb = require('../../../../../db/lowdb/index');
const { TimeNow, TimeDistance } = require('../../../utils/time');
const constant_1 = require("../../../utils/constant");
const userVirtual_1 = __importDefault(require("../../../common/userVirtual"));
function getNoMarkupStr(markupStr) {
    /* markupStr 源码</> */
    // console.log(markupStr);
    let noMarkupStr = markupStr;
    /* 得到可视文本(不含图片),将&nbsp;&lt;&gt;转为空字符串和<和>显示,同时去掉了换行,文本单行显示 */
    // console.log("1--S" + noMarkupStr + "E--");
    noMarkupStr = noMarkupStr.replace(/(\r\n|\n|\r)/gm, '');
    /* 去掉可视文本中的换行,(没有用,上一步已经自动处理) */
    // console.log("2--S" + noMarkupStr + "E--");
    noMarkupStr = noMarkupStr.replace(/^\s+/g, '');
    /* 替换开始位置一个或多个空格为一个空字符串 */
    // console.log("3--S" + noMarkupStr + "E--");
    noMarkupStr = noMarkupStr.replace(/\s+$/g, '');
    /* 替换结束位置一个或多个空格为一个空字符串 */
    // console.log("4--S" + noMarkupStr + "E--");
    noMarkupStr = noMarkupStr.replace(/\s+/g, ' ');
    /* 替换中间位置一个或多个空格为一个空格 */
    // console.log("5--S" + noMarkupStr + "E--");
    return noMarkupStr;
}
function getSubStr(_string) {
    let str = '';
    let len = 0;
    for (var i = 0; i < _string.length; i++) {
        if (_string[i].match(/[^\x00-\xff]/gi) != null) {
            len += 2;
        }
        else {
            len += 1;
        }
        if (len > 240) {
            /* 240为要截取的长度 */
            str += '...';
            break;
        }
        str += _string[i];
    }
    return str;
}
class Book {
    /**
     * 新建小书post提交
     * @param   {object} ctx 上下文对象
     */
    static createBook(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            let reqData = req.body;
            let { user = '' } = req;
            try {
                if (!reqData.title) {
                    throw new Error('请输入小书名字');
                }
                if (reqData.title.length > 150) {
                    throw new Error('小书标题过长，请小于150个字符');
                }
                if (!reqData.content) {
                    throw new Error('请输入小书详情');
                }
                let date = new Date();
                let currDate = moment_1.default(date.setHours(date.getHours())).format('YYYY-MM-DD HH:mm:ss');
                if (new Date(currDate).getTime() < new Date(user.ban_dt).getTime()) {
                    throw new Error(`当前用户因违规已被管理员禁用发布系统，时间到：${moment_1.default(user.ban_dt).format('YYYY年MM月DD日 HH时mm分ss秒')},如有疑问请联系网站管理员`);
                }
                // 虚拟币判断是否可以进行继续的操作
                const isVirtual = yield userVirtual_1.default.isVirtual({
                    uid: user.uid,
                    type: constant_1.modelName.book,
                    action: constant_1.modelAction.create
                });
                if (!isVirtual) {
                    throw new Error('贝壳余额不足！');
                }
                let $ = cheerio.load(reqData.content);
                let userRoleALL = yield models.user_role.findAll({
                    where: {
                        user_role_id: {
                            [Op.or]: user.user_role_ids.split(',')
                        },
                        user_role_type: 1 // 用户角色类型1是默认角色
                    }
                });
                let userAuthorityIds = '';
                userRoleALL.map((roleItem) => {
                    userAuthorityIds += roleItem.user_authority_ids + ',';
                });
                let status = ~userAuthorityIds.indexOf(config.BOOK.dfNoReviewBookId)
                    ? constant_1.statusList.freeReview // 免审核
                    : constant_1.statusList.pendingReview; // 待审核
                let bookCreate = yield models.book.create({
                    uid: user.uid,
                    books_id: reqData.books_id,
                    title: xss(reqData.title),
                    content: xss(reqData.content) /* 主内容 */,
                    excerpt: getSubStr(getNoMarkupStr($.text())) /* 摘记 */,
                    origin_content: reqData.origin_content /* 源内容 */,
                    status,
                    sort: reqData.sort,
                    trial_read: reqData.trial_read,
                    read_time: reqData.content.length
                });
                yield userVirtual_1.default.setVirtual({
                    uid: user.uid,
                    associate: bookCreate.book_id,
                    type: constant_1.modelName.book,
                    action: constant_1.modelAction.create
                });
                resClientJson(res, {
                    state: 'success',
                    message: '创建成功',
                    data: {
                        book: bookCreate
                    }
                });
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
    /**
     * 更新小书
     * @param   {object} ctx 上下文对象
     */
    static updateBook(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            let reqData = req.body;
            let { user = '' } = req;
            try {
                if (!reqData.title) {
                    throw new Error('请输入小书名字');
                }
                if (reqData.title.length > 150) {
                    throw new Error('小书标题过长，请小于150个字符');
                }
                if (!reqData.content) {
                    throw new Error('请输入小书详情');
                }
                let $ = cheerio.load(reqData.content);
                let date = new Date();
                let currDate = moment_1.default(date.setHours(date.getHours())).format('YYYY-MM-DD HH:mm:ss');
                if (new Date(currDate).getTime() < new Date(user.ban_dt).getTime()) {
                    throw new Error(`当前用户因违规已被管理员禁用发布系统，时间到：${moment_1.default(user.ban_dt).format('YYYY年MM月DD日 HH时mm分ss秒')},如有疑问请联系网站管理员`);
                }
                let userRoleALL = yield models.user_role.findAll({
                    where: {
                        user_role_id: {
                            [Op.or]: user.user_role_ids.split(',')
                        },
                        user_role_type: 1 // 用户角色类型1是默认角色
                    }
                });
                let userAuthorityIds = '';
                userRoleALL.map((roleItem) => {
                    userAuthorityIds += roleItem.user_authority_ids + ',';
                });
                let status = ~userAuthorityIds.indexOf(config.BOOK.dfNoReviewBookId)
                    ? constant_1.statusList.freeReview // 免审核
                    : constant_1.statusList.pendingReview; // 待审核
                yield models.book.update({
                    uid: user.uid,
                    title: xss(reqData.title),
                    content: xss(reqData.content) /* 主内容 */,
                    excerpt: getSubStr(getNoMarkupStr($.text())) /* 摘记 */,
                    origin_content: reqData.origin_content /* 源内容 */,
                    status,
                    sort: reqData.sort,
                    trial_read: reqData.trial_read,
                    read_time: reqData.content.length
                }, {
                    where: {
                        book_id: reqData.book_id,
                        uid: user.uid
                    }
                });
                resClientJson(res, {
                    state: 'success',
                    message: '修改小书成功'
                });
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
    /**
     * ajax 查询一篇用户自己的小书章节
     * @param   {object} ctx 上下文对象
     */
    static getUserBookInfo(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            let { book_id } = req.query;
            let { user = '' } = req;
            try {
                let oneBook = yield models.book.findOne({
                    where: {
                        uid: user.uid,
                        book_id
                    }
                });
                if (oneBook) {
                    if (oneBook) {
                        resClientJson(res, {
                            state: 'success',
                            message: '获取小书成功',
                            data: { book: oneBook }
                        });
                    }
                    else {
                        resClientJson(res, {
                            state: 'error',
                            message: '获取小书失败'
                        });
                    }
                }
                else {
                    throw new Error('获取小书失败');
                }
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
    /**
     * ajax 查询一篇用户可查看的小书章节
     * @param   {object} ctx 上下文对象
     */
    static getBookInfo(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            let { book_id } = req.query;
            let { user = '', islogin } = req;
            try {
                let oneBook = yield models.book.findOne({
                    where: {
                        book_id
                    }
                });
                let oneBooks = yield models.books.findOne({
                    where: {
                        books_id: oneBook.books_id
                    }
                });
                if (oneBook) {
                    if (oneBooks.is_free === constant_1.isFree.free ||
                        oneBook.trial_read === constant_1.trialRead.yes) {
                        oneBook.setDataValue('isLook', true);
                    }
                    else {
                        if (islogin) {
                            const productInfo = yield models.order.findOne({
                                where: {
                                    product_id: oneBook.books_id,
                                    product_type: constant_1.modelName.books,
                                    uid: user.uid
                                }
                            });
                            if (productInfo || user.uid === oneBook.uid) {
                                oneBook.setDataValue('isLook', true);
                            }
                        }
                        else {
                            oneBook.setDataValue('isLook', false);
                            oneBook.setDataValue('content', '需要购买方可继续阅读');
                            oneBook.setDataValue('origin_content', '需要购买方可继续阅读');
                        }
                    }
                    yield models.book.update({ read_count: Number(oneBook.read_count) + 1 }, { where: { book_id } } // 为空，获取全部，也可以自己添加条件
                    );
                    if (oneBook) {
                        resClientJson(res, {
                            state: 'success',
                            message: '获取小书成功',
                            data: { book: oneBook }
                        });
                    }
                    else {
                        resClientJson(res, {
                            state: 'error',
                            message: '获取小书失败'
                        });
                    }
                }
                else {
                    throw new Error('获取小书失败');
                }
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
    /**
     * 删除一本小书
     * @param   {object} ctx 上下文对象
     */
    static deleteBook(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const resData = req.body;
            let { user = '' } = req;
            try {
                yield models.book.destroy({
                    where: {
                        book_id: resData.book_id,
                        uid: user.uid
                    }
                });
                resClientJson(res, {
                    state: 'success',
                    message: '删除小书章节成功'
                });
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
    /**
     * 获取小书的上一页下一页
     * @param   {object} ctx 上下文对象
     */
    static getNextPrevBook(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const resData = req.body;
            try {
                let prev = yield models.book.findOne({
                    where: {
                        books_id: resData.books_id,
                        book_id: {
                            [Op.lt]: resData.book_id
                        } // 查询条件
                    },
                    limit: 1,
                    order: [['book_id', 'DESC']]
                });
                let next = yield models.book.findOne({
                    where: {
                        books_id: resData.books_id,
                        book_id: {
                            [Op.gt]: resData.book_id
                        } // 查询条件
                    },
                    limit: 1,
                    order: [['book_id', 'ASC']]
                });
                resClientJson(res, {
                    state: 'success',
                    message: '获取上一页，下一页成功',
                    data: {
                        prev,
                        next
                    }
                });
            }
            catch (err) {
                resClientJson(res, {
                    state: 'error',
                    message: '错误信息：' + err.message
                });
                return false;
            }
        });
    }
}
exports.default = Book;
