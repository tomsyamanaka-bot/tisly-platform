package com.tisly.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.widget.Button;

/**
 * Native start screen shown before the in-app WebView loads.
 * Tapping 開始する opens https://tisly.jp/customer inside WebViewShellActivity.
 */
public class StartActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_start);

        Button start = findViewById(R.id.tisly_start_button);
        if (start != null) {
            start.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Intent intent = new Intent(StartActivity.this, WebViewShellActivity.class);
                    intent.putExtra(
                        WebViewShellActivity.EXTRA_URL,
                        WebViewShellActivity.CUSTOMER_ENTRY_URL
                    );
                    startActivity(intent);
                }
            });
        }
    }
}
