# 的当てスコア（東北新幹線）

親子の的当てゲーム向け、iPhone利用前提のPWAです。  
「E5系はやぶさ・運転席モード」UIで、押しやすい得点入力と新幹線進行演出を強化しています。

## 主な機能
- 2人/3人対戦
- 得点入力 0〜10（1点刻み）
- 15点ごとの駅進行（東京〜新青森）
- Undo
- 勝敗判定: 総合計 → 最高セット得点 → サドンデス
- ローカル保存
  - `matoate.settings.v1`
  - `matoate.lastMatch.v1`
  - `matoate.bestTotal.v1`
- 追加保存
  - UI設定: `matoate.ui.v1`
  - バッジ: `matoate.badges.v1`

## UI/UX 改修点
- プレイ中 sticky HUD（現在プレイヤー/球数/合計/駅情報/Undo）
- HUDに進行チップ（セット進行/残り球/モード）とガイドメッセージを追加
- 得点ボタン 4列（0〜10 + Undo）
- 8/9/10 の強調表示、10 は最強調
- 直近投球履歴（最新8件）をプレイ画面に表示
- 駅名表示モード切替（ひらがな/漢字/併記）
- 駅名詳細トグル（初期閉）
- 現在手番プレイヤーの列車カードを強調表示
- 軽量演出（リアクション/駅到着トースト/1周クリア紙吹雪）
- 結果共有（`navigator.share` or クリップボードコピー）
- バッジ
  - はやぶさバッジ: 1周クリア
  - パワーバッジ: 10点を3回

## ローカル起動
```bash
cd "/Users/hidee/Library/CloudStorage/OneDrive-個人用/アプリ/自作アプリ"
python3 -m http.server 8000 --bind 127.0.0.1
```

- ブラウザ: <http://127.0.0.1:8000/index.html>

## GitHub Pages 公開
1. リポジトリへ push
2. GitHub: `Settings > Pages`
3. `Deploy from a branch`
4. `main / (root)` を保存
5. 反映後に公開URLを利用

## iPhone 追加手順
1. Safariで公開URLを開く
2. 共有（□↑）
3. `ホーム画面に追加`
4. アイコンから起動

## 家族へ共有
- 公開URLをLINE等で送信
- Safariで開いて同じ手順でホーム画面に追加

## 既知の注意
- iOSはPWAキャッシュ更新が遅れる場合があります。
  - 再読み込み
  - ホーム画面アプリ再起動
  - 必要時は再追加
- `prefers-reduced-motion: reduce` ではアニメーションを最小化します。
