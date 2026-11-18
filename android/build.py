"""Build and verify a signed Android APK from the checked-out CET6 website."""

import argparse
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import zipfile


HERE = Path(__file__).resolve().parent
ALIAS = "cet6-room"


def build(args):
    site = args.web.resolve()
    source = HERE / "source"
    suffix = ".exe" if os.name == "nt" else ""
    java = args.java_home.resolve() / "bin"
    sdk = args.sdk.resolve()
    android = sdk / "platforms" / "android-35" / "android.jar"
    tools = sdk / "build-tools" / "35.0.0"
    aapt = tools / ("aapt2" + suffix)
    aligner = tools / ("zipalign" + suffix)
    javac = java / ("javac" + suffix)
    keytool = java / ("keytool" + suffix)
    jvm = java / ("java" + suffix)
    d8 = tools / "lib" / "d8.jar"
    signer = tools / "lib" / "apksigner.jar"
    lambda_stubs = tools / "core-lambda-stubs.jar"
    for path in [android, aapt, aligner, javac, keytool, jvm, d8, signer, lambda_stubs, site / "study.html"]:
        if not path.is_file():
            raise SystemExit(f"Missing required file: {path}")

    signing = HERE / ".signing"
    store = signing / "cet6-room.p12"
    password_file = signing / "password.txt"
    signing.mkdir(exist_ok=True)
    if store.exists() and not password_file.exists():
        raise SystemExit("Restore the password for the existing signing key before building.")
    if not password_file.exists():
        with password_file.open("x", encoding="ascii") as password:
            password.write(secrets.token_urlsafe(32))
    env = {**os.environ, "CET6_KEYSTORE_PASSWORD": password_file.read_text(encoding="ascii").strip()}
    if not store.exists():
        subprocess.run([
            keytool, "-genkeypair", "-keystore", store, "-storetype", "PKCS12", "-alias", ALIAS,
            "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-dname", "CN=CET6 Study Room",
            "-storepass:env", "CET6_KEYSTORE_PASSWORD", "-keypass:env", "CET6_KEYSTORE_PASSWORD",
        ], check=True, env=env)

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cet6-apk-") as work:
        staging = Path(work)
        resources = staging / "res"
        manifest = staging / "AndroidManifest.xml"
        platform_jar = staging / "android.jar"
        java_source = staging / "MainActivity.java"
        shutil.copytree(source / "res", resources)
        shutil.copy2(source / "AndroidManifest.xml", manifest)
        shutil.copy2(android, platform_jar)
        shutil.copy2(source / "MainActivity.java", java_source)
        assets = staging / "assets"
        bundled = assets / "site"
        shutil.copytree(site, bundled)
        shutil.copy2(source / "native.js", bundled / "android-native.js")
        for name in ("index.html", "study.html", "vocabulary.html", "practice.html"):
            file = bundled / name
            html = file.read_text(encoding="utf-8")
            if "</head>" not in html:
                raise ValueError(f"Missing HTML head: {name}")
            file.write_text(html.replace("</head>", '<script src="android-native.js"></script></head>', 1),
                            encoding="utf-8")

        classes = staging / "classes"
        classes.mkdir()
        res = staging / "resources.zip"
        unsigned = staging / "unsigned.apk"
        aligned = staging / "aligned.apk"
        signed = staging / "signed.apk"
        subprocess.run([aapt, "compile", "--dir", resources, "-o", res], check=True)
        subprocess.run([
            aapt, "link", "-o", unsigned, "-I", platform_jar,
            "--manifest", manifest, "-A", assets, res,
        ], check=True)
        boot = os.pathsep.join(map(str, (platform_jar, lambda_stubs)))
        compiler = [javac, "-source", "8", "-target", "8"]
        if args.ecj:
            compiler = [jvm, "-jar", args.ecj.resolve(), "-1.8", "-warn:-deprecation"]
        subprocess.run([
            *compiler, "-bootclasspath", boot, "-encoding", "UTF-8", "-d", classes, java_source,
        ], check=True)
        subprocess.run([
            jvm, "-cp", d8, "com.android.tools.r8.D8", "--min-api", "26",
            "--lib", platform_jar, "--output", staging, *sorted(classes.rglob("*.class")),
        ], check=True)
        with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(staging / "classes.dex", "classes.dex")
        subprocess.run([aligner, "-f", "4", unsigned, aligned], check=True)
        subprocess.run([
            jvm, "-jar", signer, "sign", "--ks", store, "--ks-key-alias", ALIAS,
            "--ks-pass", "env:CET6_KEYSTORE_PASSWORD", "--out", signed, aligned,
        ], check=True, env=env)
        subprocess.run([jvm, "-jar", signer, "verify", "--verbose", "--print-certs", signed], check=True)
        subprocess.run([aligner, "-c", "4", signed], check=True)
        badge = subprocess.run([aapt, "dump", "badging", signed], check=True, capture_output=True,
                               encoding="utf-8").stdout
        for line in badge.splitlines():
            if re.match(r"^(package:|(?:min|target)SdkVersion:|launchable-activity:)", line):
                print(line)
        shutil.copy2(signed, output)
    print(output)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    adjacent_web = HERE.parent / "dist"
    default_web = adjacent_web if adjacent_web.is_dir() else HERE.parent / "cet6-room" / "dist"
    cli.add_argument("--web", type=Path, default=default_web)
    cli.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME"), required=not os.environ.get("ANDROID_HOME"))
    cli.add_argument("--java-home", type=Path, default=os.environ.get("JAVA_HOME"), required=not os.environ.get("JAVA_HOME"))
    cli.add_argument("--ecj", type=Path, help="Use an Eclipse Java compiler JAR in place of javac")
    cli.add_argument("--output", type=Path, default=HERE / "CET6-Study-Room.apk")
    build(cli.parse_args())
