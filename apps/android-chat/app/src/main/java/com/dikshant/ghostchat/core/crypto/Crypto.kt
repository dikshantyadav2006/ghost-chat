package com.dikshant.ghostchat.core.crypto

import com.dikshant.ghostchat.core.protocol.EncryptedFrame
import org.bouncycastle.math.ec.rfc7748.X25519
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * E2E crypto, matching @ghost/crypto/src/crypto.ts exactly:
 *  - X25519 ECDH (via BouncyCastle rfc7748, same curve as @noble/curves/ed25519)
 *  - HKDF-SHA256 salt="ghostchat-room-key-v1", info=roomId, 32-byte output
 *  - AES-256-GCM with 12-byte random IV, 128-bit tag
 *  - safety code = SHA-256(sharedSecret ++ base64(peerPubA) ++ base64(peerPubB)),
 *    first 30 hex chars grouped in fives.
 */
object Crypto {

    private val HKDF_SALT = "ghostchat-room-key-v1".toByteArray(Charsets.UTF_8)
    private const val ROOM_KEY_LENGTH = 32
    private val random = SecureRandom()

    // ---- keypairs ----

    fun generateKeyPair(): Pair<String, String> {
        val priv = ByteArray(32)
        random.nextBytes(priv)
        val pub = ByteArray(32)
        X25519.scalarMultBase(priv, 0, pub, 0)
        val b64Pub = Base64.getEncoder().encodeToString(pub)
        val b64Priv = Base64.getEncoder().encodeToString(priv)
        return b64Pub to b64Priv
    }

    fun getSharedSecret(privateKeyB64: String, publicKeyB64: String): ByteArray {
        val priv = Base64.getDecoder().decode(privateKeyB64)
        val pub = Base64.getDecoder().decode(publicKeyB64)
        val out = ByteArray(32)
        if (!X25519.calculateAgreement(priv, 0, pub, 0, out, 0)) {
            throw IllegalArgumentException("X25519 agreement failed")
        }
        return out
    }

    // ---- hashing / HKDF ----

    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).toHex()

    fun sha256(bytes: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(bytes)

    fun hkdfExpand(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)

        val hmac = Mac.getInstance("HmacSHA256")
        hmac.init(SecretKeySpec(prk, "HmacSHA256"))
        val out = ByteArray(length)
        var t = ByteArray(0)
        var offset = 0
        var counter = 1
        while (offset < length) {
            hmac.update(t)
            hmac.update(info)
            hmac.update(counter.toByte())
            t = hmac.doFinal()
            val n = minOf(t.size, length - offset)
            System.arraycopy(t, 0, out, offset, n)
            offset += n
            counter++
        }
        return out
    }

    fun deriveRoomKey(
        privateKeyB64: String,
        peerPublicKeyB64: String,
        roomId: String,
    ): ByteArray {
        val shared = getSharedSecret(privateKeyB64, peerPublicKeyB64)
        return hkdfExpand(shared, HKDF_SALT, roomId.toByteArray(Charsets.UTF_8), ROOM_KEY_LENGTH)
    }

    // ---- AES-256-GCM ----

    fun encrypt(key: ByteArray, data: ByteArray): EncryptedFrame {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = ByteArray(12)
        random.nextBytes(iv)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val ct = cipher.doFinal(data)
        return EncryptedFrame(iv, ct)
    }

    fun decrypt(key: ByteArray, frame: EncryptedFrame): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, frame.iv))
        return cipher.doFinal(frame.data)
    }

    fun encryptToB64(key: ByteArray, data: ByteArray): Pair<String, String> {
        val frame = encrypt(key, data)
        return Base64.getEncoder().encodeToString(frame.iv) to
            Base64.getEncoder().encodeToString(frame.data)
    }

    fun decryptFromB64(key: ByteArray, ivB64: String, dataB64: String): ByteArray =
        decrypt(
            key,
            EncryptedFrame(
                iv = Base64.getDecoder().decode(ivB64),
                data = Base64.getDecoder().decode(dataB64),
            ),
        )

    // ---- safety code ----

    fun computeSafetyCode(
        sharedSecret: ByteArray,
        myPublicKeyB64: String,
        peerPublicKeyB64: String,
    ): String {
        val a = myPublicKeyB64.toByteArray(Charsets.US_ASCII)
        val b = peerPublicKeyB64.toByteArray(Charsets.US_ASCII)
        val material = ByteArray(sharedSecret.size + a.size + b.size)
        System.arraycopy(sharedSecret, 0, material, 0, sharedSecret.size)
        System.arraycopy(a, 0, material, sharedSecret.size, a.size)
        System.arraycopy(b, 0, material, sharedSecret.size + a.size, b.size)
        val hex = sha256Hex(material)
        return hex.take(30).chunked(5).joinToString("-")
    }

    // ---- helpers ----

    fun ByteArray.toHex(): String {
        val sb = StringBuilder(size * 2)
        for (b in this) sb.append("%02x".format(b.toInt() and 0xff))
        return sb.toString()
    }
}
