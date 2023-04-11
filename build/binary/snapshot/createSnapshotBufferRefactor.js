"use strict";
// @ts-nocheck
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const count_1 = __importDefault(require("../message/count"));
const countDiff_1 = __importDefault(require("../entity/countDiff"));
const BinarySection_1 = require("../../common/binary/BinarySection");
const writeMessage_1 = __importDefault(require("../message/writeMessage"));
const writeDiff_1 = __importDefault(require("../entity/writeDiff"));
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
const Binary_1 = require("../../common/binary/Binary");
const getVisibleState = (user, instance) => {
    const vis = user.checkVisibility(instance.tick);
    const createEntities = [];
    for (let i = 0; i < vis.newlyVisible.length; i++) {
        const nid = vis.newlyVisible[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema);
            }
            createEntities.push(entity);
        }
        else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`);
        }
    }
    const messages = user.messageQueue;
    // empty the queue
    user.messageQueue = [];
    const deleteEntities = vis.noLongerVisible;
    const updateEntities = [];
    //console.log('stillVisible', vis.stillVisible.length)
    for (let i = 0; i < vis.stillVisible.length; i++) {
        const nid = vis.stillVisible[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        if (nschema) {
            const diffs = instance.cache.getAndDiff(instance.tick, entity, nschema);
            diffs.forEach(diff => {
                updateEntities.push(diff);
            });
        }
    }
    //console.log('getVisibleState', instance.tick, createEntities.length, updateEntities.length, deleteEntities.length)
    return {
        createEntities,
        updateEntities,
        deleteEntities,
        messages
    };
};
const createSnapshotBufferRefactor = (user, instance) => {
    var _a;
    let bytes = 0;
    bytes += 1; // section BinarySection.EngineMessages
    bytes += 1; // quantity of engine messages
    bytes += 1; // section BinarySection.Messages
    bytes += 4; // quantity of messages
    bytes += 1; // delete entities
    bytes += 4; // quantity of entities to delete
    const { createEntities, updateEntities, deleteEntities, messages } = getVisibleState(user, instance);
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const nschema = instance.context.getSchema(message.ntype);
        //console.log('counting', message, nschema)
        bytes += (0, count_1.default)(nschema, message);
    }
    if (user.responseQueue.length > 0) {
        bytes += 1;
        bytes += 4;
        for (let i = 0; i < user.responseQueue.length; i++) {
            bytes += 4; // requestId
            // @ts-ignore
            bytes += (0, BinaryExt_1.default)(Binary_1.Binary.String).count(user.responseQueue[i].response);
        }
    }
    if (createEntities.length > 0) {
        // section create
        bytes += 1;
        bytes += 4;
        for (let i = 0; i < createEntities.length; i++) {
            const nid = createEntities[i].nid;
            const entity = instance.localState.getByNid(nid);
            const nschema = instance.context.getSchema(entity.ntype);
            bytes += (0, count_1.default)(nschema, entity);
        }
    }
    if (updateEntities.length > 0) {
        // section update
        bytes += 1;
        bytes += 4;
        for (let i = 0; i < updateEntities.length; i++) {
            const diff = updateEntities[i];
            bytes += (0, countDiff_1.default)(diff, diff.nschema);
        }
    }
    for (let i = 0; i < deleteEntities.length; i++) {
        bytes += 4;
    }
    // TODO this buffer alloc is node-only, but instance should work in html5 too
    const bw = (_a = user.network) === null || _a === void 0 ? void 0 : _a.binaryWriterFactory.create(bytes);
    //const bw = new instance.bufferConstructor(Buffer.allocUnsafe(bytes), 0)
    bw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
    bw.writeUInt8(0);
    bw.writeUInt8(BinarySection_1.BinarySection.Messages);
    bw.writeUInt32(messages.length);
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const nschema = instance.context.getSchema(message.ntype);
        (0, writeMessage_1.default)(message, nschema, bw);
    }
    if (user.responseQueue.length > 0) {
        bw.writeUInt8(BinarySection_1.BinarySection.Responses);
        bw.writeUInt32(user.responseQueue.length);
        for (let i = 0; i < user.responseQueue.length; i++) {
            bw.writeUInt32(user.responseQueue[i].requestId);
            bw.writeString(user.responseQueue[i].response);
            // @ts-ignore
            //bw[BinaryExt(Binary.String).write](user.responseQueue[i].response)
        }
    }
    if (createEntities.length > 0) {
        bw.writeUInt8(BinarySection_1.BinarySection.CreateEntities);
        bw.writeUInt32(createEntities.length);
        for (let i = 0; i < createEntities.length; i++) {
            const entity = createEntities[i];
            const nschema = instance.context.getSchema(entity.ntype);
            (0, writeMessage_1.default)(entity, nschema, bw);
        }
    }
    if (updateEntities.length > 0) {
        bw.writeUInt8(BinarySection_1.BinarySection.UpdateEntities);
        bw.writeUInt32(updateEntities.length);
        //console.log('updates', updateEntities.length)
        for (let i = 0; i < updateEntities.length; i++) {
            const diff = updateEntities[i];
            (0, writeDiff_1.default)(diff.nid, diff, diff.nschema, bw);
        }
    }
    bw.writeUInt8(BinarySection_1.BinarySection.DeleteEntities);
    bw.writeUInt32(deleteEntities.length);
    for (let i = 0; i < deleteEntities.length; i++) {
        bw.writeUInt32(deleteEntities[i]);
    }
    user.responseQueue = [];
    return bw.buffer;
};
exports.default = createSnapshotBufferRefactor;
