# Cecypo POS Mpesa

POS Mpesa Quick Pay integration for ERPNext - adds a "Quick Pay - Mpesa" button to the Point of Sale interface for quick payment processing using Mpesa C2B Payment Register.

## Features

- ✅ **Quick Pay Button** in Point of Sale checkout screen
- ✅ **Search & Select** pending Mpesa C2B payments
- ✅ **Multiple Payment Selection** - apply multiple Mpesa payments to a single invoice
- ✅ **Payment Age Indicators** - visual indicators showing payment age
- ✅ **Exact Match Detection** - highlights payments matching invoice amount
- ✅ **Overpayment Warnings** - alerts when payments exceed outstanding amount
- ✅ **STK Push Requests** - send payment requests directly from POS
- ✅ **Auto-save/Submit** - optional automatic invoice processing

## Requirements

- **ERPNext**: v14+ or v15+
- **frappe_mpsa_payments**: Must be installed (provides Mpesa C2B Payment Register and core Mpesa functionality)

## Installation

```bash
# Get the app
cd frappe-bench
bench get-app https://github.com/cecypo/cecypo_pos_mpesa

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

### 1. Mode of Payment (Phone Type)

1. Go to: **Accounts > Mode of Payment**
2. Create or edit Mode of Payment (e.g., "Mpesa")
3. Set **Type** = "Phone"
4. Enable it
5. Add **Mode of Payment Account** for your company

### 2. Mpesa Settings

1. Go to: **Mpesa Settings**
2. Create/Edit record for your company
3. Set **business_shortcode** (e.g., 174379)
4. Set **payment_gateway_name**
5. Save

### 3. Payment Gateway Account

1. Go to: **Payment Gateway Account**
2. Ensure account exists with Payment Gateway containing "Mpesa"
3. Set **payment_account**

## Usage

### In Point of Sale

1. Open **Point of Sale** (Selling > Point of Sale)
2. Add items to cart
3. Select customer
4. Click **Checkout**
5. Look for the green **"Quick Pay - Mpesa"** button at the top of the payment section
6. Click to open payment selection dialog
7. Search and select Mpesa payments
8. Click **Add Payments**
9. Complete order

### Button Location

```
Payment Method Section
├─ [💚 Quick Pay - Mpesa]  <-- HERE
├─ Cash
├─ Card
└─ Bank Transfer
```

### Payment Request (STK Push)

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
- Try searching (min 3 characters)

### Validation Errors

- **"Mode of Payment is required"**: This is now fixed in v1.0.0
- **"Cannot add payments to cancelled invoice"**: Invoice was cancelled, create new one
- **"No Phone type Mode of Payment configured"**: Set up Mode of Payment with Type="Phone"

## Technical Details

### Files Structure

```
cecypo_pos_mpesa/
├── cecypo_pos_mpesa/
│   ├── __init__.py
│   ├── hooks.py              # Frappe hooks
│   ├── api.py                # Backend API endpoints
│   ├── patches/              # Database migrations
│   │   └── v1_0/
│   │       └── add_pos_invoice_to_mpesa_c2b.py
│   └── public/
│       └── js/
│           ├── point_of_sale_mpesa.js          # POS integration
│           └── pos_invoice_mpesa_quick_pay.js  # Form view integration
├── pyproject.toml
└── README.md
```

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

## Version History

### v1.0.0 (2026-01-26)
- Initial release
- POS Quick Pay button integration
- Payment selection dialog with search
- Multiple payment support
- STK Push payment requests
- Auto-save and auto-submit options
- Payment age indicators
- Exact match detection
- Overpayment warnings

## License

AGPL-3.0

## Support

- **Developer**: Cecypo.Tech
- **Email**: support@cecypo.tech
- **GitHub**: https://github.com/cecypo/cecypo_pos_mpesa

## Credits

Built on top of `frappe_mpsa_payments` by Navari Limited.
