// Keep these tags aligned with the translation languages in languages.py.
const supported = new Set([
  "ja", "en", "zh-hans", "zh-hant", "ko", "ar", "az", "be", "bg", "bn", "ca", "ceb",
  "de", "es", "et", "eu", "fa", "fr", "gu", "he", "hi", "hr", "hu", "hy", "id", "it",
  "jv", "ka", "kk", "km", "lt", "lv", "ml", "mr", "ms", "my", "ne", "nl", "pa", "pl",
  "ru", "si", "sk", "sl", "sr", "sw", "ta", "te", "th", "tl", "ur", "uz", "vi",
]);

function selectLocale(languages) {
  for (const language of languages) {
    let locale;
    try {
      locale = new Intl.Locale(language);
    } catch {
      continue;
    }
    if (locale.language === "zh") {
      if (locale.script === "Hans" || locale.script === "Hant") return `zh-${locale.script.toLowerCase()}`;
      if (!locale.script) return locale.maximize().script === "Hant" ? "zh-hant" : "zh-hans";
    }
    const base = locale.language === "fil" ? "tl" : locale.language;
    if (supported.has(base)) return base;
  }
}

export const preferredLocale = selectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
const messages = await loadMessages(preferredLocale);
export const uiLocale = preferredLocale !== "ja" && !messages ? "en" : preferredLocale;

async function loadMessages(locale) {
  if (!locale || locale === "ja" || locale === "en") return null;
  try {
    const response = await fetch(new URL(`./locales/${locale}.json`, import.meta.url));
    if (response.ok) return await response.json();
  } catch {
    // The English catalog is bundled for use when the locale file is unavailable.
  }
  return null;
}

const english = new Map([
  ["ローカル翻訳", "Local Translator"],
  ["サイドバーを開く", "Open sidebar"],
  ["新しい翻訳", "New translation"],
  ["翻訳ツール", "Translation tools"],
  ["モデル管理", "Manage models"],
  ["翻訳先の設定", "Target language settings"],
  ["用語集の管理", "Manage glossaries"],
  ["翻訳履歴", "Translation history"],
  ["選択した履歴を削除", "Delete selected entries"],
  ["履歴の編集モード", "History editing mode"],
  ["履歴を編集", "Edit history"],
  ["全ての履歴を削除", "Delete all history"],
  ["履歴の編集を閉じる", "Close history editing"],
  ["作成者：", "Created by: "],
  ["Source：", "Source: "],
  ["ダークモード", "Dark mode"],
  ["翻訳欄の移動", "Translation pane navigation"],
  ["左の欄へ", "Previous pane"],
  ["右の欄へ", "Next pane"],
  ["原文", "Source text"],
  ["翻訳する文章を入力", "Enter text to translate"],
  ["文脈を追加", "Add context"],
  ["参考文脈", "Context"],
  ["例：登場人物が大雨のあとに川沿いを歩いている場面です。", "Example: The characters are walking along the river after heavy rain."],
  ["翻訳設定", "Translation settings"],
  ["適用する用語集", "Glossaries to apply"],
  ["保存した用語集はここに表示されます。", "Saved glossaries appear here."],
  ["＋用語集を追加", "＋ Add glossary"],
  ["日本語訳の文体", "Japanese writing style"],
  ["指定なし", "No preference"],
  ["だ・である調", "Plain style"],
  ["です・ます調", "Polite style"],
  ["モデルを選択", "Select a model"],
  ["GPUを使用中", "Using GPU"],
  ["GPUを使用", "Use GPU"],
  ["モデル管理を開く", "Open model manager"],
  ["使用するモデル", "Model to use"],
  ["このモデルを選ぶ", "Use this model"],
  ["翻訳", "Translate"],
  ["翻訳先の言語", "Target language"],
  ["訳文", "Translation"],
  ["翻訳結果がここに表示されます", "Your translation will appear here"],
  ["訳文をコピー", "Copy translation"],
  ["再翻訳", "Retranslate"],
  ["再翻訳先の言語", "Retranslation target language"],
  ["翻訳先を選択", "Choose a target language"],
  ["自動切り替え", "Switch automatically"],
  ["自分の言語が入力された場合はよく使う言語へ、外国語の場合は自分の言語へ翻訳します。", "Text in your language is translated into the language you use often. Text in other languages is translated into your language."],
  ["自分の言語", "Your language"],
  ["言語を選択", "Choose a language"],
  ["よく使う言語", "Language you use often"],
  ["キャンセル", "Cancel"],
  ["保存", "Save"],
  ["翻訳で使う訳語を、用語集ごとにまとめられます。", "Group the terms you want to use in translations into glossaries."],
  ["用語集の管理を閉じる", "Close glossary manager"],
  ["保存済みの用語集", "Saved glossaries"],
  ["＋新しい用語集", "＋ New glossary"],
  ["用語集を選択", "Select a glossary"],
  ["インポート", "Import"],
  ["エクスポート", "Export"],
  ["新しい用語集", "New glossary"],
  ["用語集を削除", "Delete glossary"],
  ["用語集の名前", "Glossary name"],
  ["例：製品ドキュメント", "Example: Product documentation"],
  ["用語", "Terms"],
  ["＋用語を追加", "＋ Add term"],
  ["原語", "Source term"],
  ["例：dashboard", "Example: dashboard"],
  ["訳語", "Translation"],
  ["例：管理画面", "Example: control panel"],
  ["有効", "Enabled"],
  ["この用語を削除", "Delete this term"],
  ["削除", "Delete"],
  ["モデル管理を閉じる", "Close model manager"],
  ["モデル一覧", "Available models"],
  ["必要なモデルだけダウンロードできます。", "Download only the models you need."],
  ["モデルはこのサイトのブラウザーストレージに保存されます。8B・31Bの実行には64ビットWebAssembly対応と十分なメモリが必要です。", "Models are saved in browser storage for this site. The 8B and 31B models require 64-bit WebAssembly support and enough memory."],
  ["保存済みのGGUFモデルを取り込む", "Import a saved GGUF model"],
  ["ファイルを選択", "Choose file"],
  ["モデルには", "The models are covered by the "],
  ["PLaMoコミュニティライセンス", "PLaMo Community License"],
  ["が適用されます。商用利用の場合は", ". For commercial use, check the "],
  ["事前登録などの利用条件", "terms of use, including advance registration"],
  ["を確認してください。", "."],
  ["実行", "Continue"],
  ["入力にPLaMoの制御トークンやNUL文字を含めることはできません。", "The input cannot contain PLaMo control tokens or NUL characters."],
  ["翻訳元と翻訳先に異なる言語を選んでください。", "Choose different source and target languages."],
  ["文体を指定できるのは日本語への翻訳時です。", "You can specify a writing style when translating into Japanese."],
  ["ブラウザーの推論ランタイムを起動できませんでした。", "Could not start the browser inference runtime."],
  ["言語判定データを取得できませんでした。", "Could not load language detection data."],
  ["ライトモードに切り替える", "Switch to light mode"],
  ["ダークモードに切り替える", "Switch to dark mode"],
  ["サイドバーを閉じる", "Close sidebar"],
  ["訳文は取得できましたが、履歴を保存できませんでした。", "Translation completed, but the history could not be saved."],
  ["モデルなし", "No model"],
  ["CPUに切り替える", "Switch to CPU"],
  ["GPUに切り替える", "Switch to GPU"],
  ["GPUを利用できません", "GPU unavailable"],
  ["パネルを閉じると変更を適用します。", "Close the panel to apply changes."],
  ["CPUを使用中", "Using CPU"],
  ["GPU未検出", "No GPU detected"],
  ["約{0}GB", "About {0} GB"],
  ["{0}のダウンロード進捗", "{0} download progress"],
  ["取得済み", "Downloaded"],
  ["PLaMo Translate {0}を削除", "Delete PLaMo Translate {0}"],
  ["モデルを削除しますか？", "Delete this model?"],
  ["{0}を保存先から削除します。使うには再ダウンロードが必要です。", "{0} will be removed from storage. Download it again to use it."],
  ["削除する", "Delete"],
  ["{0}を削除しました。", "Deleted {0}."],
  ["ダウンロードを中止しますか？", "Cancel the download?"],
  ["{0}の途中まで取得したデータを削除します。", "The partial download for {0} will be deleted."],
  ["中止する", "Cancel download"],
  ["おすすめ", "Recommended"],
  ["ダウンロード中 · {0}MB", "Downloading · {0} MB"],
  ["ダウンロードを中止", "Cancel download"],
  ["ダウンロードを再試行", "Retry download"],
  ["ダウンロード", "Download"],
  ["{0}の{1}", "{1} · {0}"],
  ["モデルの状態を取得できませんでした。", "Could not retrieve model status."],
  ["モデルを取り込み中…", "Importing model…"],
  ["モデルを取り込みました。", "Model imported."],
  ["用語集の{0}行目に原語と訳語を入力してください。", "Enter a source term and translation on row {0}."],
  ["この用語を削除しますか？", "Delete this term?"],
  ["入力した原語と訳語を編集欄から取り除きます。", "The source term and its translation will be removed from the editor."],
  ["{0} / 20行", "{0} / 20 rows"],
  ["翻訳設定を保存できませんでした。", "Could not save translation settings."],
  ["「{0}」に異なる訳語が指定されています。適用する用語集を見直してください。", "“{0}” has conflicting translations. Review the selected glossaries."],
  ["適用する用語は合計20組までです。用語集の選択を減らしてください。", "You can apply up to 20 terms in total. Select fewer glossaries."],
  ["保存済みの用語集はありません。", "No saved glossaries."],
  ["{0}件が有効", "Active terms: {0}"],
  ["用語集を編集", "Edit glossary"],
  ["保存しました", "Saved"],
  ["削除しました", "Deleted"],
  ["名前と用語を1組以上入力してください。", "Enter a name and at least one term pair."],
  ["用語集を削除しますか？", "Delete this glossary?"],
  ["「{0}」と登録されている用語を削除します。", "“{0}” and its terms will be deleted."],
  ["{0}件の用語集を追加しました。", "Glossaries added: {0}."],
  ["JSONファイルを読み込めませんでした。", "Could not read the JSON file."],
  ["翻訳中…", "Translating…"],
  ["翻訳時間 {0}秒", "Translated in {0} s"],
  ["出力上限に達しました。原文を分けて再翻訳してください。", "Output limit reached. Split the source text and translate it again."],
  ["「再翻訳」の右にある言語ボタンから翻訳先を選んでください。", "Choose a target language using the language button next to Retranslate."],
  ["再翻訳中…", "Retranslating…"],
  ["再翻訳が出力上限に達しました。", "Retranslation reached the output limit."],
  ["この訳文は出力上限で途中まで表示されています。", "This translation was cut short at the output limit."],
  ["履歴の編集メニュー", "History editing menu"],
  ["翻訳履歴を削除しますか？", "Delete translation history?"],
  ["{0}件の履歴を削除します。", "History entries to delete: {0}."],
  ["履歴を読み込み中…", "Loading history…"],
  ["翻訳履歴はありません。", "No translation history."],
  ["「{0}」を選択", "Select “{0}”"],
  ["訳文をコピーしました。", "Translation copied."],
  ["自動でコピーできませんでした。選択した訳文をコピーしてください。", "Could not copy automatically. Copy the selected translation manually."],
  ["よく使う言語には、自分の言語と異なる言語を選んでください。", "Choose a second language that differs from your language."],
  ["翻訳先の設定を保存できませんでした。ブラウザーのサイトデータ設定を確認してください。", "Could not save target language settings. Check your browser’s site data settings."],
  ["自動判定", "Detect automatically"],
  ["言語一覧を取得できませんでした。ページを再読み込みしてください。", "Could not load the language list. Reload the page."],
  ["翻訳用モデルをダウンロード（{0}GB）", "Download a translation model ({0} GB)"],
  ["最も小さい翻訳用モデルをブラウザに保存します。\n保存したモデルは「モデル管理」から削除できます。", "This saves the smallest translation model in your browser.\nYou can remove it from Manage models."],
  ["ダウンロードを中止しました。", "Download canceled."],
  ["モデルを保存できませんでした。通信とブラウザーの空き容量を確認してください。", "Could not save the model. Check your connection and available browser storage."],
  ["PLaMo {0}のモデルを取得中…", "Downloading the PLaMo {0} model…"],
  ["保存済みモデルを読み込めませんでした。", "Could not load the saved model."],
  ["対応するPLaMo 3 TranslateのQ4_K_M GGUFファイルを選んでください。", "Choose a compatible PLaMo 3 Translate Q4_K_M GGUF file."],
  ["ダウンロードが終わってから取り込んでください。", "Wait for the download to finish before importing."],
  ["言語一覧を取得できませんでした。", "Could not load the language list."],
  ["先にモデルをダウンロードしてください。", "Download the model first."],
  ["この操作を実行できません。", "This action is unavailable."],
  ["モデルを読み込めませんでした。", "Could not load the model."],
  ["モデルを読み込み中…", "Loading the model…"],
  ["WebGPUにモデルを読み込み中…", "Loading the model on WebGPU…"],
  ["このモデルにはMemory64に対応したブラウザーが必要です。", "This model requires a browser with WebAssembly Memory64 support."],
  ["31BはCPU用のブラウザーメモリ上限を超えます。WebGPUと十分なメモリを備えた端末で試してください。", "The 31B model exceeds the browser memory limit for CPU inference. Try a device with WebGPU and enough memory."],
  ["31Bの翻訳にはGPUへの切り替えが必要です。", "Switch to GPU to translate with the 31B model."],
  ["CPUにモデルを読み込み中…", "Loading the model on the CPU…"],
  ["ブラウザー内で翻訳中…", "Translating in the browser…"],
  ["入力が長すぎます。原文を分けて翻訳してください。", "The input is too long. Split the source text and translate it in parts."],
  ["原文を処理できませんでした。", "Could not process the source text."],
  ["訳文の生成に失敗しました。", "Could not generate the translation."],
  ["モデルをダウンロードできませんでした。", "Could not download the model."],
  ["用語集の名前と用語を確認してください。", "Check the glossary name and terms."],
  ["用語集の用語を確認してください。", "Check the glossary terms."],
  ["用語集を1件以上含むJSONファイルを選んでください。", "Choose a JSON file containing at least one glossary."],
  ["元の翻訳履歴が見つかりません。", "The original history entry could not be found."],
]);

export function t(message, ...values) {
  const localized = uiLocale === "ja" ? message : messages?.[message] ?? english.get(message) ?? message;
  return values.length ? localized.replace(/\{(\d+)\}/g, (_, index) => values[index]) : localized;
}

export function localizePage() {
  document.documentElement.lang = uiLocale;
  document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(uiLocale) ? "rtl" : "ltr";
  if (uiLocale === "ja") return;

  // Localize the initial markup before the app inserts any user content.
  function localize(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const message = node.data.trim();
        if (english.has(message)) node.data = node.data.replace(message, () => t(message));
        continue;
      }
      for (const attribute of ["aria-label", "title", "placeholder"]) {
        const message = node.getAttribute(attribute);
        if (english.has(message)) node.setAttribute(attribute, t(message));
      }
      if (node instanceof HTMLTemplateElement) localize(node.content);
    }
  }
  localize(document.documentElement);
}
