# QNAP Business Archive

## パス規約

```
/TOMS/business/{customer}/{projectId}/
  estimate/
  invoice/
  completion-report/
  photos/
  survey/
```

## API

- `POST /api/business/projects/:id/qnap/save` — mock保存（ローカル `uploads/business/{id}/qnap-mock/` にミラー）

## 本番

SMB/WebDAV アップロードは `mockSaveToQnap` 相当の実装に差し替え。
