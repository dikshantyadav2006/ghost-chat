plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.dikshant.ghostchat"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.dikshant.ghostchat"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SIGNAL_URL", "\"https://trytotry-vm6v.onrender.com\"")
        buildConfigField("String", "APP_ORIGIN", "\"https://chat.dikshantyadav.in\"")
        buildConfigField("String", "TURN_URLS", "\"\"")
        buildConfigField("String", "TURN_USERNAME", "\"\"")
        buildConfigField("String", "TURN_CREDENTIAL", "\"\"")
        buildConfigField("String", "CLOUDINARY_CLOUD_NAME", "\"\"")
        buildConfigField("String", "CLOUDINARY_UPLOAD_PRESET", "\"\"")
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.socketio.client)
    implementation(libs.webrtc.android)
    implementation(libs.bouncycastle)
    implementation(libs.zxing.core)
    implementation(libs.mlkit.barcode)
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.common)
    implementation(libs.media3.ui)
    implementation(libs.coil.compose)
    implementation(libs.navigation.compose)

    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
