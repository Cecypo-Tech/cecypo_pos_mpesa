# Mpesa for POS 

Mpesa for POS integration for ERPNext - adds a "Quick Pay - Mpesa" button to the Point of Sale interface for quick payment processing using Mpesa C2B Payment Register.

## Features

- ✅ **Quick Pay Button** in Point of Sale checkout screen
- ✅ **Search & Select** unused Mpesa C2B payments - Built for Sale Teams in mind; 3 character search required (matching name/phone/txnid)
- ✅ **Multiple Payment Selection** - apply multiple Mpesa payments to a single invoice
- ✅ **Payment Age Indicators** - visual indicators showing payment age
- ✅ **Exact Match Detection** - highlights payments matching invoice amount
- ✅ **Overpayment Warnings** - alerts when payments exceed outstanding amount
- ✅ **STK Push Requests** - send payment requests directly from POS
- ✅ **Auto-save/Submit** - optional automatic invoice processing

## Screenshots
Button:
![Quick Pay button](https://i.imgur.com/hamlthP.png "Quick Pay button")
Mpesa payment selection:
![Mpesa Selection](https://i.imgur.com/efcgdo7.png "Mpesa Selection")
## Requirements

- **ERPNext**: v15
- **frappe_mpsa_payments**: This app is only an **extension** to https://github.com/navariltd/frappe-mpsa-payments/

## Installation

```bash
# Get the app
cd frappe-bench
bench get-app https://github.com/Cecypo-Tech/cecypo_pos_mpesa.git

# Install on your site
bench --site [your-site] install-app cecypo_pos_mpesa

# Migrate to create custom fields
bench --site [your-site] migrate

# Build assets
bench build --app cecypo_pos_mpesa

# Restart
bench restart
```

## Setup

- Ensure that the mode of payment for mpesa is `Phone`
- This needs Navari's MPESA app. If already in use and correctly setup, this will work straight out of the box!

### Payment Request (STK Push) [BETA]

1. Click **"Quick Pay - Mpesa"**
2. Click **"Request Payment"** button
3. Enter customer's phone number
4. Click **"Send Request"**
5. Customer receives STK push on phone

## How It Works

1. **Dialog shows DRAFT Mpesa C2B Payment Register entries** (docstatus=0)
2. User searches and selects payments to apply
3. When processing:
   - Mpesa C2B Payment Register is submitted (docstatus → 1)
   - Customer and Mode of Payment are linked
   - Payment row is added to POS Invoice's payments table
   - Mpesa entry is linked to POS Invoice
   - Invoice is saved (and optionally submitted)

## Troubleshooting

### Button Not Showing

1. Hard refresh browser (Ctrl+Shift+R)
2. Verify you're on the checkout/payment screen
3. Check browser console for errors
4. Verify Mpesa is configured:

```javascript
// Run in console
frappe.call({
    method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
    args: {
        action: 'check_mpesa_available',
        company: cur_pos.frm.doc.company
    },
    callback: r => console.log('Available:', r.message)
});
```

### No Payments in Dialog

- Check Mpesa C2B Payment Register for DRAFT entries
- Verify `businessshortcode` matches Mpesa Settings
- Ensure payments haven't been submitted already
- Try searching (min 3 characters) - values to match are NAME / PHONE / TRANS ID

### Validation Errors

- **"Mode of Payment is required"**: This is now fixed in v1.0.0
- **"Cannot add payments to cancelled invoice"**: Invoice was cancelled, create new one
- **"No Phone type Mode of Payment configured"**: Set up Mode of Payment with Type="Phone"

## Technical Details

### API Endpoints

**Method**: `cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process`

**Actions**:
- `check_mpesa_available` - Validates Mpesa configuration
- `get_mpesa_payments` - Fetches pending payments with optional search
- `process_mpesa` - Processes selected payments and adds to POS Invoice
- `get_customer_phone` - Gets customer phone from contacts
- `create_payment_request` - Creates STK push payment request

### Custom Fields Added

**Mpesa C2B Payment Register**:
- `pos_invoice` (Link to POS Invoice) - Tracks which POS Invoice the payment was applied to

## License

AGPL-3.0

## Credits
Built on top of `frappe_mpsa_payments` by Navari Limited.
