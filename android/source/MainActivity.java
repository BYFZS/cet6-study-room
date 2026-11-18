package io.github.byfzs.cet6room;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PATH = "/assets/site/";
    private static final String HOME = "https://" + HOST + PATH + "study.html";
    private static final String EXAM_HOST = "www.cettong.cn";
    private static final String EXAM_PATH = "/library/cet6/2025_06_1/";
    private static final String SYNC_HOST = "cet6-sync-nov26.linedsunflower3.chatgpt.site";
    private static final int MAX_SYNC_BYTES = 1_400_000;
    private static final int OPEN_JSON = 1;
    private static final int SAVE_JSON = 2;
    private static final int MAX_JSON_CHARS = 10 * 1024 * 1024;
    private static final String CSP = "default-src 'self'; frame-src 'none'; object-src 'none'; "
        + "script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        + "connect-src 'self' https://" + EXAM_HOST + " https://" + SYNC_HOST + "; media-src 'self' blob:";

    private WebView web;
    private final ExecutorService syncRequests = Executors.newFixedThreadPool(2);
    private TextToSpeech voice;
    private boolean voiceReady;
    private ValueCallback<Uri[]> chooser;
    private File pendingExport;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) {
            String pendingName = state.getString("pendingExport");
            if (pendingName != null) pendingExport = new File(getCacheDir(), pendingName);
        }
        setTitle("CET6 复习室");
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(244, 245, 239));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 245, 239));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets padding = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
                return WindowInsets.CONSUMED;
            });
            getWindow().setDecorFitsSystemWindows(false);
        }
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // The user-selected JSON file uses a content URI.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new StudyBridge(), "CET6Android");
        web.setWebViewClient(new LocalPages());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> reply, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = reply;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(pick, OPEN_JSON);
                } catch (ActivityNotFoundException e) {
                    chooser = null;
                    reply.onReceiveValue(null);
                    notice("找不到系统文件选择器。");
                }
                return true;
            }
        });
        voice = new TextToSpeech(this, status -> runOnUiThread(() -> {
            if (voice != null && status == TextToSpeech.SUCCESS) {
                voiceReady = voice.setLanguage(Locale.US) >= TextToSpeech.LANG_AVAILABLE;
            }
        }));
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
    }

    private static boolean isHttpsHost(Uri uri, String host) {
        return "https".equals(uri.getScheme()) && host.equals(uri.getHost()) && uri.getPort() == -1;
    }

    private static boolean isLocal(Uri uri) {
        String path = uri.getPath();
        return isHttpsHost(uri, HOST) && path != null && path.startsWith(PATH);
    }

    private static WebResourceResponse unavailable(int status, String message) {
        return new WebResourceResponse("text/plain", "UTF-8", status, message, Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeType(String extension) {
        switch (extension) {
            case "html": return "text/html";
            case "css": return "text/css";
            case "js":
            case "mjs": return "text/javascript";
            case "json": return "application/json";
            default: return "application/octet-stream";
        }
    }

    private final class LocalPages extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isHttpsHost(uri, SYNC_HOST) && uri.getPath() != null
                && uri.getPath().startsWith("/v1/") && !request.isForMainFrame()) return null;
            if (!"GET".equals(request.getMethod())) return unavailable(403, "Forbidden");
            if (isHttpsHost(uri, EXAM_HOST) && uri.getPath() != null
                && uri.getPath().startsWith(EXAM_PATH) && !request.isForMainFrame()) return null;
            if (!isLocal(uri)) return unavailable(403, "Forbidden");
            String resource = uri.getPath().substring(PATH.length());
            if (resource.isEmpty()) resource = "index.html";
            if (!resource.matches("[A-Za-z0-9._/-]+") || resource.contains("..")) {
                return unavailable(404, "Not Found");
            }
            String extension = resource.substring(resource.lastIndexOf('.') + 1);
            try {
                return new WebResourceResponse(mimeType(extension),
                    "UTF-8", 200, "OK", Collections.singletonMap("Content-Security-Policy", CSP),
                    getAssets().open("site/" + resource));
            } catch (IOException e) {
                return unavailable(404, "Not Found");
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocal(uri)) return false;
            if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException e) {
                    notice("找不到可打开此链接的浏览器。");
                }
            }
            return true;
        }
    }

    public final class StudyBridge {
        @JavascriptInterface
        public void syncRequest(String id, String path, String method, String token, String body) {
            if (id == null || !id.matches("[0-9a-f]{32}")) return;
            if (path == null || !path.matches("/v1/(state|pair|account|tutor)/[0-9a-f]{32}")
                    || !("GET".equals(method) || "POST".equals(method) || "PUT".equals(method))
                    || token == null || (!token.isEmpty() && !token.matches("[0-9a-f]{64}"))
                    || (body != null && (body.length() > MAX_SYNC_BYTES || "GET".equals(method)))) {
                replyToSync(id, 0, "", "request");
                return;
            }
            if (!syncRequests.isShutdown()) syncRequests.execute(() -> exchangeSync(id, path, method, token, body));
        }

        @JavascriptInterface
        public void speak(String text, float rate) {
            if (text == null || text.isEmpty() || text.length() > 200) return;
            runOnUiThread(() -> {
                if (!voiceReady || voice == null) {
                    notice("手机英语语音暂不可用，请检查系统文字转语音设置。");
                    return;
                }
                voice.setSpeechRate(Math.max(0.5f, Math.min(1.5f, rate)));
                if (voice.speak(text, TextToSpeech.QUEUE_FLUSH, null, "word") != TextToSpeech.SUCCESS) {
                    notice("读音播放失败，请重试。");
                }
            });
        }

        @JavascriptInterface
        public void stopSpeech() {
            runOnUiThread(() -> { if (voice != null) voice.stop(); });
        }

        @JavascriptInterface
        public void saveJson(String name, String json) {
            if (name == null || !name.matches("CET6-[\\p{L}0-9_-]{1,80}\\.json")) return;
            if (json == null || json.length() > MAX_JSON_CHARS) {
                runOnUiThread(() -> notice("导出文件太大。"));
                return;
            }
            runOnUiThread(() -> beginExport(name, json));
        }
    }

    private void exchangeSync(String id, String path, String method, String token, String body) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL("https://" + SYNC_HOST + path).openConnection();
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(path.startsWith("/v1/tutor/") ? 40000 : 15000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Origin", "https://" + HOST);
            if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                byte[] data = body.getBytes(StandardCharsets.UTF_8);
                if (data.length > MAX_SYNC_BYTES) {
                    replyToSync(id, 0, "", "request");
                    return;
                }
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(data.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(data); }
            }
            int status = connection.getResponseCode();
            try (InputStream input = status < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                if (input != null) {
                    for (int size; (size = input.read(buffer)) != -1;) {
                        if (output.size() + size > MAX_SYNC_BYTES) throw new IOException("response limit");
                        output.write(buffer, 0, size);
                    }
                }
                replyToSync(id, status, output.toString("UTF-8"), "");
            }
        } catch (UnknownHostException error) {
            replyToSync(id, 0, "", "dns");
        } catch (SSLException error) {
            replyToSync(id, 0, "", "tls");
        } catch (SocketTimeoutException error) {
            replyToSync(id, 0, "", "timeout");
        } catch (IOException error) {
            replyToSync(id, 0, "", "network");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void replyToSync(String id, int status, String body, String error) {
        runOnUiThread(() -> {
            if (isDestroyed()) return;
            String call = "window.cet6SyncReply && window.cet6SyncReply(" + JSONObject.quote(id)
                + "," + status + "," + JSONObject.quote(body) + "," + JSONObject.quote(error) + ")";
            web.evaluateJavascript(call, null);
        });
    }

    private void beginExport(String name, String json) {
        if (pendingExport != null) return;
        try {
            pendingExport = File.createTempFile("cet6-export-", ".json", getCacheDir());
            Files.write(pendingExport.toPath(), json.getBytes(StandardCharsets.UTF_8));
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(save, SAVE_JSON);
        } catch (IOException | ActivityNotFoundException e) {
            clearExport();
            notice("无法创建导出文件，请重试。");
        }
    }

    private void clearExport() {
        if (pendingExport != null) {
            pendingExport.delete();
            pendingExport = null;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (uri != null && !"content".equals(uri.getScheme())) uri = null;
        if (request == OPEN_JSON && chooser != null) {
            chooser.onReceiveValue(uri == null ? null : new Uri[] {uri});
            chooser = null;
        }
        if (request == SAVE_JSON) {
            try {
                if (uri != null && pendingExport != null) {
                    try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                        if (output == null) throw new IOException("No file stream");
                        Files.copy(pendingExport.toPath(), output);
                    }
                    notice("学习记录已导出。");
                }
            } catch (IOException | SecurityException e) {
                notice("导出失败，请重新选择保存位置。");
            } finally {
                clearExport();
            }
        }
    }

    private void notice(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
        if (pendingExport != null) state.putString("pendingExport", pendingExport.getName());
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        syncRequests.shutdownNow();
        if (isFinishing()) clearExport();
        if (voice != null) voice.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
