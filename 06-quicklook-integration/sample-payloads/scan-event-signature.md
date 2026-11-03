# Worked signature example

Use this to check that both sides compute the same signature. Test values only.

| Item | Value |
|---|---|
| Shared secret | `test_secret_do_not_use_in_production` |
| X-QL-Timestamp | `1793594645` |

Raw body (compact JSON, exactly as sent):

```text
{"eventId":"evt_01HF8Z3K2N","eventType":"logo.scanned","occurredAt":"2026-11-02T10:14:05+05:30","scan":{"scanId":"qls_01HF8Z3K2M","logoId":"logo_game_spin"},"user":{"sub":"ql_pw_8f3a2c91"}}
```

Signed payload:

```text
1793594645.{"eventId":"evt_01HF8Z3K2N","eventType":"logo.scanned","occurredAt":"2026-11-02T10:14:05+05:30","scan":{"scanId":"qls_01HF8Z3K2M","logoId":"logo_game_spin"},"user":{"sub":"ql_pw_8f3a2c91"}}
```

Expected header:

```text
X-QL-Signature: v1=14fdee153b2959fdca140eb8e2c1bb3fae5e5025642da9fa3718c6259afdb33f
```

The signature is computed over the raw body bytes as sent. Re-formatting the JSON changes the signature.
