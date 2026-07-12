const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, HeadingLevel, BorderStyle, PageBreak
} = require('docx');

const US_LETTER = {
  width: 12240,
  height: 15840,
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
};

// ── Build the cover page ──────────────────────────────────────
function buildCoverPage({ fullName, dateBirth, datePassing, photoBuffer }) {
  const children = [];

  if (photoBuffer) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [
          new ImageRun({
            data: photoBuffer,
            transformation: { width: 280, height: 280 },
            type: 'png'
          })
        ]
      })
    );
  } else {
    // Push content down to roughly the same position whether or not there's a photo
    children.push(new Paragraph({ spacing: { after: 1800 }, children: [] }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: fullName || '', size: 40, font: 'Georgia' })
      ]
    })
  );

  if (dateBirth || datePassing) {
    const dateLine = [dateBirth, datePassing].filter(Boolean).join('  –  ');
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [
          new TextRun({ text: dateLine, size: 24, color: '57534E', font: 'Georgia' })
        ]
      })
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

// ── Build a content section ───────────────────────────────────
function buildSection(title, bodyText) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({ text: title })]
    })
  ];

  const paragraphs = (bodyText || '').split(/\n\n+/).filter(p => p.trim());
  paragraphs.forEach(p => {
    children.push(
      new Paragraph({
        spacing: { after: 200, line: 360 },
        children: [new TextRun({ text: p.trim(), size: 24, font: 'Georgia' })]
      })
    );
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

// ── POST /api/export — builds docx, optionally converts to PDF ─
// body: { fullName, dateBirth, datePassing, program, obituary, eulogy, photoBase64, format }
router.post('/', async (req, res) => {
  const { fullName, dateBirth, datePassing, program, obituary, eulogy, photoBase64, format } = req.body;

  if (!program && !obituary && !eulogy) {
    return res.status(400).json({ error: 'No content provided to export' });
  }

  try {
    let photoBuffer = null;
    if (photoBase64) {
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      photoBuffer = Buffer.from(base64Data, 'base64');
      // Cap photo size at ~5MB decoded to avoid abuse
      if (photoBuffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Photo is too large. Please use an image under 5MB.' });
      }
    }

    const docChildren = [
      ...buildCoverPage({ fullName, dateBirth, datePassing, photoBuffer })
    ];

    if (program) docChildren.push(...buildSection('Memorial Program', program));
    if (obituary) docChildren.push(...buildSection('Obituary', obituary));
    if (eulogy) docChildren.push(...buildSection('Eulogy', eulogy));

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Georgia', size: 24 } } },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 32, bold: true, font: 'Georgia', color: '1C1917' },
            paragraph: {
              spacing: { before: 240, after: 240 },
              outlineLevel: 0,
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C4B8A8', space: 4 } }
            }
          }
        ]
      },
      sections: [{ properties: { page: US_LETTER }, children: docChildren }]
    });

    const buffer = await Packer.toBuffer(doc);

    const safeName = (fullName || 'memorial').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obit-export-'));
    const docxPath = path.join(tmpDir, `${safeName}.docx`);
    fs.writeFileSync(docxPath, buffer);

    if (format === 'pdf') {
      execFile('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, docxPath], (err) => {
        if (err) {
          console.error('PDF conversion error:', err.message);
          // Fall back to docx if conversion isn't available in this environment
          res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          return res.send(buffer);
        }
        const pdfPath = path.join(tmpDir, `${safeName}.pdf`);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.sendFile ? res.sendFile(pdfPath) : fs.createReadStream(pdfPath).pipe(res);
        // Clean up temp dir after response
        res.on('finish', () => fs.rm(tmpDir, { recursive: true, force: true }, () => {}));
      });
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buffer);
      fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    }
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

module.exports = router;
