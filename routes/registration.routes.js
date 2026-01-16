const express = require('express');
const { createRegistration } = require('../controllers/registration.controller');
const { protect, isAdmin } = require('../middleware/auth.middleware');
const { submitUPIProof, viewPaymentScreenshot, finalApprove } = require('../controllers/payment.controller');
const Registration = require('../models/Registration');
const upload = require('../middleware/upload.middleware');
const mongoose = require('mongoose');

const router = express.Router();

// Public registration route
router.post('/', upload.single('ieeeMembershipCertificate'), createRegistration);

// List all registrations that have IEEE membership certificates
router.get('/ieee-certificates', protect, isAdmin, async (req, res, next) => {
    try {
        const registrations = await Registration.find({
            ieeeMember: 'yes',
            'ieeeMembershipCertificate.data': { $exists: true, $ne: null }
        })
            .select(
                'registrationId fullName email phone college event ieeeId isTeam teamName createdAt'
            )
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: registrations
        });
    } catch (error) {
        next(error);
    }
});

// List all registrations (without returning binary certificate data)
router.get('/', protect, isAdmin, async (req, res, next) => {
    try {
        const registrations = await Registration.find({})
            .select('-ieeeMembershipCertificate.data -paymentScreenshot.data -payment.screenshot.data')
            .sort({ createdAt: -1 });

        const data = registrations.map(r => {
            const cert = r.ieeeMembershipCertificate;
            const hasIeeeCertificate = Boolean(
                (r.ieeeMember || 'no').toString().toLowerCase() === 'yes' &&
                cert &&
                (cert.contentType || cert.fileName)
            );

            return {
                ...r.toObject(),
                hasIeeeCertificate
            };
        });

        res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
});

// Submit manual UPI proof (UTR + screenshot)
router.post('/:id/upi-proof', upload.single('paymentScreenshot'), submitUPIProof);

// View payment screenshot (Admin only)
router.get('/:id/payment-screenshot', protect, isAdmin, viewPaymentScreenshot);

// Final approve (Admin only)
router.post('/:id/final-approve', protect, isAdmin, finalApprove);

// Public QR scan page (shows registration info)
router.get('/qr/:registrationId', async (req, res, next) => {
    try {
        const { registrationId } = req.params;

        if (!registrationId) {
            return res.status(400).send('Invalid registration id');
        }

        const registration = await Registration.findOne({ registrationId }).select(
            'registrationId fullName event isTeam teamName teamMembers status'
        );

        if (!registration) {
            return res.status(404).send('Registration not found');
        }

        const escapeHtml = (value) => {
            const str = value === undefined || value === null ? '' : String(value);
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const safeRegistrationId = escapeHtml(registration.registrationId);
        const safeTeamName = escapeHtml(registration.teamName);
        const safeFullName = escapeHtml(registration.fullName);
        const safeEvent = escapeHtml(registration.event);
        const safeStatus = escapeHtml(registration.status);
        const teamBlock = registration.isTeam && registration.teamName
            ? `<div class="row"><div class="label">Team Name</div><div class="value">${safeTeamName}</div></div>`
            : '';

        console.log('DEBUG - registration.isTeam:', registration.isTeam);
        console.log('DEBUG - registration.teamMembers:', registration.teamMembers);
        console.log('DEBUG - teamMembers length:', registration.teamMembers?.length);

        const teamMembersBlock = registration.isTeam && Array.isArray(registration.teamMembers) && registration.teamMembers.length > 0
            ? (() => {
                console.log('DEBUG - Creating team members block for', registration.teamMembers.length, 'members');
                return registration.teamMembers
                    .map((member, index) => {
                        const safeMemberName = escapeHtml(member?.name || '');
                        console.log('DEBUG - Processing member', index + 1, ':', safeMemberName);
                        return `<div class="row"><div class="label">Team Member ${index + 1}</div><div class="value">${safeMemberName}</div></div>`;
                    })
                    .join('');
            })()
            : (() => {
                console.log('DEBUG - No team members to display');
                return '';
            })();

        const statusClass = (() => {
            const s = (registration.status || '').toString().toLowerCase();
            if (s === 'confirmed') return 'status confirmed';
            if (s === 'pending_payment') return 'status pending';
            if (s === 'cancelled') return 'status cancelled';
            return 'status';
        })();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chakravyuh 2.0 - QR Pass</title>
    <style>
      :root{
        --bg1:#0b1020;
        --bg2:#101a3a;
        --card:#ffffff;
        --text:#0f172a;
        --muted:#64748b;
        --line:#e6e9f2;
        --brand1:#4a6cf7;
        --brand2:#6f8cff;
      }
      *{box-sizing:border-box;}
      body{
        margin:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        background: radial-gradient(1200px 600px at 10% 10%, rgba(74,108,247,0.35), transparent 60%),
                    radial-gradient(1000px 500px at 90% 20%, rgba(111,140,255,0.30), transparent 55%),
                    linear-gradient(135deg, var(--bg1), var(--bg2));
        color:#e5e7eb;
        padding:20px;
        min-height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .wrap{width:100%; max-width:700px;}
      .card{
        background: var(--card);
        border-radius: 18px;
        overflow:hidden;
        box-shadow: 0 18px 45px rgba(0,0,0,0.35);
        transform: translateY(0);
        animation: pop 360ms ease-out;
      }
      @keyframes pop{from{transform:translateY(10px); opacity:0.6;} to{transform:translateY(0); opacity:1;}}
      .header{
        padding:18px 18px 16px;
        background: linear-gradient(135deg, var(--brand1), var(--brand2));
        color:#fff;
      }
      .headerTop{display:flex; align-items:center; justify-content:space-between; gap:12px;}
      .brand{display:flex; flex-direction:column;}
      .brand h1{margin:0; font-size:18px; letter-spacing:0.3px;}
      .brand p{margin:4px 0 0; font-size:12px; opacity:0.95;}
      .pill{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:8px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.25);
        font-size:12px;
        font-weight:700;
        white-space:nowrap;
      }
      .content{padding:18px; color: var(--text);}
      .grid{
        display:grid;
        grid-template-columns: 1fr;
        gap:12px;
        margin-top:14px;
      }
      .row{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding:12px 12px;
        border:1px solid var(--line);
        border-radius: 12px;
        background: #fbfcff;
      }
      .label{font-size:12px; color: var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:0.6px;}
      .value{font-size:14px; font-weight:700; color: var(--text); text-align:right; word-break:break-word;}
      .status{display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; font-size:12px; font-weight:800;}
      .status.confirmed{background:#e9fff3; color:#0b7a39; border:1px solid #b7f3d0;}
      .status.pending{background:#fff7e6; color:#8a5a00; border:1px solid #ffe1a6;}
      .status.cancelled{background:#ffecec; color:#b42318; border:1px solid #ffc6c6;}
      .actions{display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;}
      button{
        appearance:none;
        border:0;
        border-radius: 12px;
        padding:10px 12px;
        font-weight:800;
        cursor:pointer;
      }
      .btnPrimary{background: linear-gradient(135deg, var(--brand1), var(--brand2)); color:#fff;}
      .btnGhost{background:#eef2ff; color:#2b3ea8;}
      .hint{margin-top:12px; font-size:12px; color: var(--muted);}
      .footer{padding: 14px 18px 18px; color:black; font-size:12px; text-align:center;}
      @media (min-width: 620px){
        .grid{grid-template-columns: 1fr 1fr;}
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="header">
          <div class="headerTop">
            <div class="brand">
              <h1>Chakravyuh 2.0</h1>
              <p>QR Pass • Show this at the registration desk</p>
            </div>
            <div class="pill">ID: ${safeRegistrationId}</div>
          </div>
        </div>

        <div class="content">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="font-size:16px; font-weight:900;">Registration Details</div>
            <span class="${statusClass}">${safeStatus}</span>
          </div>

          <div class="grid">
            <div class="row"><div class="label">Registration ID</div><div class="value" id="rid">${safeRegistrationId}</div></div>
            ${teamBlock}
            <div class="row"><div class="label">Name</div><div class="value">${safeFullName}</div></div>
            <div class="row"><div class="label">Event</div><div class="value">${safeEvent}</div></div>
            ${teamMembersBlock}
          </div>

          <div class="actions">
            <button class="btnPrimary" id="copyBtn" type="button">Copy Registration ID</button>
            <button class="btnGhost" id="reloadBtn" type="button">Refresh</button>
          </div>
          <div class="hint">Tip: Keep this page open while entering the venue.</div>
        </div>

        <div class="footer">© ${new Date().getFullYear()} Chakravyuh 2.0</div>
      </div>
    </div>

    <script>
      (function(){
        const copyBtn = document.getElementById('copyBtn');
        const reloadBtn = document.getElementById('reloadBtn');
        const rid = document.getElementById('rid');

        if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload());

        if (copyBtn && rid) {
          copyBtn.addEventListener('click', async () => {
            try {
              const text = rid.textContent || '';
              await navigator.clipboard.writeText(text);
              const prev = copyBtn.textContent;
              copyBtn.textContent = 'Copied!';
              setTimeout(() => (copyBtn.textContent = prev), 1200);
            } catch (e) {
              alert('Copy failed. Please copy manually.');
            }
          });
        }
      })();
    </script>
  </body>
</html>`);
    } catch (error) {
        next(error);
    }
});

// Get registration by ID
router.get('/:id', async (req, res, next) => {
    try {
        const key = (req.params.id || '').toString().trim();

        if (!key) {
            return res.status(400).json({
                success: false,
                message: 'Invalid registration id'
            });
        }

        const projection = '-ieeeMembershipCertificate.data -paymentScreenshot.data -payment.screenshot.data';

        let registration = null;
        if (mongoose.Types.ObjectId.isValid(key)) {
            registration = await Registration.findById(key).select(projection);
        }

        if (!registration) {
            registration = await Registration.findOne({ registrationId: key }).select(projection);
        }

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        res.json({ success: true, data: registration });
    } catch (error) {
        next(error);
    }
});

// View/download IEEE membership certificate
router.get('/:id/ieee-certificate', protect, isAdmin, async (req, res, next) => {
    try {
        const key = (req.params.id || '').toString().trim();

        if (!key) {
            return res.status(400).json({
                success: false,
                message: 'Invalid registration id'
            });
        }
        if (!mongoose.Types.ObjectId.isValid(key)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid registration id'
            });
        }
        const registration = await Registration.findById(req.params.id).select('ieeeMembershipCertificate ieeeMember');
        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        if ((registration.ieeeMember || 'no').toString().toLowerCase() !== 'yes') {
            return res.status(404).json({
                success: false,
                message: 'IEEE certificate not available'
            });
        }

        const cert = registration.ieeeMembershipCertificate;
        if (!cert?.data || !cert?.contentType) {
            return res.status(404).json({
                success: false,
                message: 'IEEE certificate not available'
            });
        }

        res.setHeader('Content-Type', cert.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${cert.fileName || 'ieee-certificate'}"`);
        return res.send(cert.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
