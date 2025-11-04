import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import com.android.build.api.dsl.ApplicationExtension
import com.android.build.api.dsl.LibraryExtension

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Force consistent JVM targets for all Kotlin and Java compilation tasks across subprojects
subprojects {
    tasks.withType<KotlinCompile>().configureEach {
        kotlinOptions {
            // Keep compatibility with older plugins that still target 1.8
            val jvm18Modules = setOf("receive_sharing_intent", "flutter_file_dialog")
            jvmTarget = if (jvm18Modules.contains(project.name)) "1.8" else "17"
        }
    }
}

// Ensure Java compilation across all subprojects uses Java 17 to avoid
// mismatches with plugins compiled for newer JVM targets (e.g., Kotlin 17)
// Note: Do not force JavaCompile source/target across all subprojects to avoid
// conflicts with plugins that expect 1.8; allow each plugin to control its own
// Java/toolchain settings. The app module itself sets Java 17.

// Do not override Android plugin subprojects' compileOptions here to avoid
// interfering with AGP's configuration and plugin expectations.

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
