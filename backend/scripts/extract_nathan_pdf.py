from pathlib import Path

pdf = Path(r"C:\projects\soyosoyobank\react-ui\backend\NATHAN Loan Installment Breakdown - SOYOSOYO  SACCO_.pdf")
print('exists', pdf.exists(), 'size', pdf.stat().st_size if pdf.exists() else 0)

try:
    import pypdf
except Exception as e:
    print('import_err', type(e).__name__, str(e))
    raise

reader = pypdf.PdfReader(str(pdf))
text_parts = []
for i, page in enumerate(reader.pages, start=1):
    page_text = page.extract_text() or ''
    text_parts.append(f"\n--- PAGE {i} ---\n{page_text}")

text = ''.join(text_parts)
out = Path(r"C:\projects\soyosoyobank\react-ui\backend\nathan_breakdown_extracted.txt")
out.write_text(text, encoding='utf-8')
print('extracted_to', out)
print(text[:6000])
