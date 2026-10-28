"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const node_crypto_1 = require("node:crypto");
const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        (0, node_crypto_1.scrypt)(password, salt, KEY_LENGTH, {
            N: SCRYPT_N,
            r: SCRYPT_R,
            p: SCRYPT_P,
            maxmem: SCRYPT_MAX_MEMORY,
        }, (error, key) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(key);
        });
    });
}
async function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16);
    const key = await deriveKey(password, salt);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(password, storedHash) {
    if (!storedHash)
        return false;
    const [algorithm, saltHex, keyHex, ...extraParts] = storedHash.split('$');
    if (algorithm !== 'scrypt' ||
        !saltHex ||
        !/^[0-9a-f]{32}$/i.test(saltHex) ||
        !keyHex ||
        !/^[0-9a-f]{128}$/i.test(keyHex) ||
        extraParts.length > 0) {
        return false;
    }
    const expectedKey = Buffer.from(keyHex, 'hex');
    const actualKey = await deriveKey(password, Buffer.from(saltHex, 'hex'));
    return (0, node_crypto_1.timingSafeEqual)(expectedKey, actualKey);
}
