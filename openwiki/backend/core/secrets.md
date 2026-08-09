---
type: backend
title: API Key 静态加密
description: app/core/secrets.py 中 AES-256-GCM 加密、enc:v2 格式、主密钥派生与旧版格式拒绝。
tags: [security, encryption, aes-gcm, api-key, secrets]
---

# API Key 静态加密

所有存入数据库的 API Key（LLM、ASR、TTS 等）均通过 `app/core/secrets.py` 进行 AES-256-GCM 加密。

## 关键符号

- `encrypt_secret(plaintext)` / `decrypt_secret(value)`
- `LegacySecretFormatError`
- `validate_master_key_env()`
- `_derive_key(master, salt)` — PBKDF2-HMAC-SHA256，200k 次迭代
- `_master_bytes()` — LRU 缓存主密钥

## 加密格式

```
enc:v2:<b64-salt16>:<b64-nonce12>:<b64-tag16>:<b64-cipher>
```

- 每次加密使用随机 salt 与 nonce。
- GCM 输出拆分为 ciphertext 与 tag 分别 base64 编码。
- `_VERSION_V2 = "enc:v2"`；旧 `_VERSION_V1 = "enc:v1"` 明文拒绝解密，提示用户到设置页重新保存。

## 主密钥来源

优先级：

1. 环境变量 `INTERVIEWOS_SECRET_KEY`（支持 base64 或明文 ≥16 字节）。
2. 文件 `backend/data/.secret.key`（自动生成的 32 字节随机密钥）。
3. 旧路径 `backend/app/data/.secret.key` 自动迁移到新路径。

生产环境必须显式设置 `INTERVIEWOS_SECRET_KEY`，否则 `app/main.py` 启动失败。dev 环境允许自动生成密钥。

## 不变式

- `encrypt_secret(None)` 返回 `None`；空字符串原样返回。
- 已加密的值再次加密不会重复嵌套（检测 `enc:v2:` 前缀）。
- 解密失败抛 `ValueError` 或 `LegacySecretFormatError`，不静默吞错。

## 聚焦测试

- `tests/test_secrets.py`：加解密往返、legacy 格式拒绝、master key 派生、环境变量校验。

## 相关页面

- [安全辅助](./security.md)
- [后端入口](../main.md)
- [安全总览](../../security.md)
