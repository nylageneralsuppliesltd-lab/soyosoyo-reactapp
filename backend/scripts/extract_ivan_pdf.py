from pathlib import Path
import pypdf

pdf = Path(r"C:\projects\soyosoyobank\react-ui\frontend\Ivan Loan Installment Breakdown - SOYOSOYO  SACCO_.pdf")
print('exists', pdf.exists(), 'size', pdf.stat().st_size if pdf.exists() else 0)
reader = pypdf.PdfReader(str(pdf))
text_parts = []
for i, page in enumerate(reader.pages, start=1):
    page_text = page.extract_text() or ''
    text_parts.append(f"\n--- PAGE {i} ---\n{page_text}")
text = ''.join(text_parts)
out = Path(r"C:\projects\soyosoyobank\react-ui\backend\ivan_breakdown_extracted.txt")
out.write_text(text, encoding='utf-8')
print('extracted_to', out)
print(text[:8000])
