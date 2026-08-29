package com.dikshant.ghostchat.core.session

import android.content.Context
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnectionFactory
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/** Shared PeerConnectionFactory / EGL context for all sessions. */
object RtcFactory {
    private var initialized = false
    var eglBase: EglBase? = null
        private set
    private var factory: PeerConnectionFactory? = null

    fun init(context: Context) {
        if (initialized) return
        initialized = true
        val options = PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        eglBase = EglBase.create()
        val encoderFactory = DefaultVideoEncoderFactory(eglBase!!.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase!!.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
    }

    fun get(): PeerConnectionFactory =
        factory ?: throw IllegalStateException("RtcFactory not initialized")

    /** Builds a front camera capturer for calls. */
    fun createCameraCapturer(): VideoCapturer? {
        val enumerator = Camera1Enumerator()
        val deviceNames = enumerator.deviceNames
        var capturer: VideoCapturer? = null
        for (name in deviceNames) {
            if (enumerator.isFrontFacing(name)) {
                capturer = enumerator.createCapturer(name, null)
                if (capturer != null) break
            }
        }
        if (capturer == null) {
            for (name in deviceNames) {
                if (!enumerator.isFrontFacing(name)) {
                    capturer = enumerator.createCapturer(name, null)
                    if (capturer != null) break
                }
            }
        }
        return capturer
    }

    fun createAudioSource(): AudioSource =
        get().createAudioSource(org.webrtc.MediaConstraints())

    fun createAudioTrack(id: String, source: AudioSource): AudioTrack =
        get().createAudioTrack(id, source)

    fun createLocalMediaStream(label: String): MediaStream =
        get().createLocalMediaStream(label)

    fun createVideoSource(capturer: VideoCapturer): VideoSource =
        get().createVideoSource(capturer.isScreencast)

    fun createVideoTrack(id: String, source: VideoSource): VideoTrack =
        get().createVideoTrack(id, source)
}
