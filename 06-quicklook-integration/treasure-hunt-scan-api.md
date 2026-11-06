# Treasure Hunt Scan API for QuickLook

3 Nov 2026

QuickLook's backend calls this API once for every Treasure Hunt stall logo scan, straight away. The data is encrypted with a key we give QuickLook for each environment.

## 1. Endpoint

| Item | Value |
| --- | --- |
| Method | POST |
| URL (test environment) | `https://k9atxletdc.execute-api.ap-south-1.amazonaws.com/integrations/quicklook/v1/hunt-scans` |
| URL (production) | Shared before the event |
| Header | `Content-Type: application/json` |
| Body | `{"data": "<hex>"}` |
| When | Once for every stall logo scan, straight away |
| Key | 32 bytes (64 hex characters), one per environment, shared separately and not by email |

## 2. Data to send

This JSON is encrypted and sent as `data`.

```json
{
  "logo_id": "0b6f2a10-1c1e-4a61-9a01-000000000001",
  "user_id": "edef31a4-8dfb-4e60-81ea-dc7168aead6a",
  "user_name": "Dilshan Amarasinghe",
  "scanned_at": "2026-11-03T10:14:05+05:30",
  "event_id": "evt_01HF8Z3K2N"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `logo_id` | Yes | The scanned logo. Send only the logos allocated to the Treasure Hunt: every logo sent counts |
| `user_id` | Yes | The QuickLook user, the same ID as in the game links |
| `user_name` | Yes | The user's name, shown to event staff only |
| `scanned_at` | Yes (agreed) | Scan time, ISO 8601 with timezone or Unix seconds. A scan older than 5 minutes is refused |
| `event_id` | Yes (agreed) | Unique for each scan. A scan sent again with the same ID is stored once |

## 3. Encryption

AES-256-GCM, the same format as the game links.

1. Make a new random 12 byte IV for every request.
2. Encrypt the JSON (UTF-8) with the 32 byte key.
3. Join the IV, the ciphertext and the 16 byte auth tag, in that order.
4. Send the result as lowercase hex in `data`.

Node.js example:

```javascript
const crypto = require('crypto');

function encryptScan(scan, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(scan), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('hex');
}
```

## 4. Sample request

This sample uses an example key only, so your encryption can be checked against ours. It encrypts the JSON in section 2 with a fixed IV (`a1b2c3d4e5f60718293a4b5c`) so the result is always the same. Real requests must use a new random IV each time.

Example key: `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`

```http
POST /integrations/quicklook/v1/hunt-scans
Content-Type: application/json

{
  "data": "a1b2c3d4e5f60718293a4b5c79040d96f85d38a1d02703a406166a66f5ba92ee0f7928e0cc5737e23af5cc04588cfdaf503f740f0b6a622cd3e3bf841acb9f161a6589cae98edf8659c8d0682d636bdb7e3bcf094b3975ed2f9f5501b147f479eb146a4af1229334215bc0eb641c25dc53021fe7a0fc758ec676aa0b2ee64403f7f0f08615dd4b6575b49afdad2d1f5635ba5166e39457d3010375c2a2953c0b90ddb19a3aca1468a94aa6eb42563769a05dbe236ec47209d025bebc72ab7ceffc226262ca411b8e4348cef211b1e92a3fa48bf8fbbdca489392586d0e14b5530696d4458b44"
}
```

## 5. Responses

HTTP 200 means the scan was stored. The `result` says what happened.

```json
{ "received": true, "result": "counted" }
```

| `result` | Meaning |
| --- | --- |
| `counted` | First scan of this logo by this user in the session. Points added |
| `repeat` | This user already scanned this logo in the session. Stored, no points |
| `no-session` | No session was running at the scan time. Stored, no points |
| `already-received` | This `event_id` was received before. Not stored again |

Errors:

| HTTP | Code | Meaning | What to do |
| --- | --- | --- | --- |
| 400 | `MESSAGE_INVALID` | Wrong key, changed data or a required field missing | Do not send again |
| 400 | `MESSAGE_EXPIRED` | `scanned_at` is more than 5 minutes old | Do not send again |
| 503 | `NOT_READY` | The key is not set up for this environment yet | Send again later |
| 500 or no answer | | A problem on our side | Send again with the same `event_id` |

```json
{ "error": { "code": "MESSAGE_INVALID", "message": "The scan message could not be opened" } }
```
