package com.tkg111.holdthedeck;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

// Hold the Deck's Android app: the game fills the whole screen, with the
// status and navigation bars hidden (sticky immersive: a swipe from the edge
// shows them for a moment) and drawn under a notch or punch-hole camera.
// The cutout's insets are handed to the page as --native-inset-* CSS
// variables (CSS px), which the game reads (index.html's #safe-probe) to keep
// its HUD clear of the camera, since not every WebView reports them through
// env(safe-area-inset-*).
public class MainActivity extends BridgeActivity {

    private Insets cutout = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
        hideSystemBars();

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            sendInsets();
            return insets;
        });
        // Again once the game's page has loaded (insets can arrive before it).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                sendInsets();
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    // The cutout's insets (physical px) as CSS px on the page's root, then a
    // 'safe-area-change' event so the game re-lays its HUD.
    private void sendInsets() {
        if (bridge == null || bridge.getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        String js = String.format(Locale.ROOT,
            "document.documentElement&&(function(s){s.setProperty('--native-inset-left','%.2fpx');s.setProperty('--native-inset-top','%.2fpx');"
                + "s.setProperty('--native-inset-right','%.2fpx');s.setProperty('--native-inset-bottom','%.2fpx');"
                + "window.dispatchEvent(new Event('safe-area-change'));})(document.documentElement.style)",
            cutout.left / density, cutout.top / density, cutout.right / density, cutout.bottom / density);
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
