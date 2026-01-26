# Quick Pay - Mpesa API for POS Invoice
# API endpoints for POS Invoice Mpesa Quick Pay functionality

import frappe
from frappe import _
from frappe.utils import flt, nowdate


# === HELPER FUNCTIONS ===

def get_phone_mop_for_company(company):
    """Get Phone type Mode of Payment that has an account for this company"""
    phone_mops = frappe.get_all("Mode of Payment", filters={"type": "Phone", "enabled": 1}, fields=["name"])

    for mop in phone_mops:
        account = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": mop["name"], "company": company},
            "default_account"
        )
        if account:
            return mop["name"]

    return None


def get_mpesa_shortcode_for_company(company):
    """Get business_shortcode from Mpesa Settings for this company"""
    settings = frappe.get_all(
        "Mpesa Settings",
        filters={"company": company},
        fields=["name", "business_shortcode"],
        limit=1
    )

    if settings and settings[0].get("business_shortcode"):
        return str(settings[0]["business_shortcode"])

    return None


@frappe.whitelist()
def check_mpesa_configuration():
    """Diagnostic function to check Mpesa configuration"""
    result = {"success": True, "issues": []}

    # Check Mode of Payment
    mops = frappe.get_all("Mode of Payment", filters={"type": "Phone", "enabled": 1}, fields=["name"])
    if not mops:
        result["success"] = False
        result["issues"].append("No Phone-type Mode of Payment found")
    else:
        result["phone_mop"] = [m["name"] for m in mops]
        # Check accounts
        for mop in mops:
            accounts = frappe.get_all("Mode of Payment Account",
                filters={"parent": mop["name"]},
                fields=["company", "default_account"])
            if not accounts:
                result["success"] = False
                result["issues"].append(f"Mode of Payment '{mop['name']}' has no company accounts")

    # Check Mpesa Settings
    settings = frappe.get_all("Mpesa Settings", fields=["name", "company", "business_shortcode"])
    if not settings:
        result["success"] = False
        result["issues"].append("No Mpesa Settings found")
    else:
        result["mpesa_settings"] = settings

    # Check Payment Gateway
    gateways = frappe.get_all("Payment Gateway Account",
        filters={"payment_gateway": ["like", "%Mpesa%"]},
        fields=["name", "payment_gateway"])
    result["payment_gateways"] = gateways

    return result


@frappe.whitelist()
def pos_quick_pay_mpesa_process(**kwargs):
    """Main API endpoint for POS Invoice Mpesa Quick Pay"""
    action = frappe.form_dict.get("action")

    if action == "check_mpesa_available":
        return check_mpesa_available()

    elif action == "get_mpesa_payments":
        return get_mpesa_payments()

    elif action == "process_mpesa":
        return process_mpesa()

    elif action == "get_customer_phone":
        return get_customer_phone()

    elif action == "create_payment_request":
        return create_payment_request()

    else:
        frappe.throw(_("Invalid action"))


def check_mpesa_available():
    """Check if Mpesa is available for the company"""
    company = frappe.form_dict.get("company")

    phone_mop = get_phone_mop_for_company(company) if company else None
    shortcode = get_mpesa_shortcode_for_company(company) if company else None

    available = bool(phone_mop and shortcode)

    return {"available": available}


def get_mpesa_payments():
    """Get pending Mpesa C2B payments for the company"""
    company = frappe.form_dict.get("company")
    search = frappe.form_dict.get("search") or ""

    if not company:
        return {"count": 0, "payments": []}

    shortcode = get_mpesa_shortcode_for_company(company)

    if not shortcode:
        return {"count": 0, "payments": []}

    # Base filters - draft Mpesa payments for this company's shortcode
    base_filters = {
        "docstatus": 0,
        "businessshortcode": shortcode
    }

    # Get count of all available payments
    total_count = frappe.db.count("Mpesa C2B Payment Register", base_filters)

    # If search provided (min 3 chars), filter results
    payments = []
    if len(search) >= 3:
        # Build OR filters for search
        search_lower = search.lower()
        all_payments = frappe.get_all(
            "Mpesa C2B Payment Register",
            filters=base_filters,
            fields=[
                "name", "full_name", "transamount", "transid",
                "msisdn", "posting_date", "billrefnumber", "creation"
            ],
            order_by="creation desc",
            limit_page_length=100
        )

        # Filter in Python for flexible OR search
        for p in all_payments:
            full_name = (p.get("full_name") or "").lower()
            transid = (p.get("transid") or "").lower()
            billref = (p.get("billrefnumber") or "").lower()
            msisdn = (p.get("msisdn") or "").lower()

            if search_lower in full_name or search_lower in transid or search_lower in billref or search_lower in msisdn:
                payments.append(p)

    return {"count": total_count, "payments": payments}


def process_mpesa():
    """Process selected Mpesa payments and add to POS Invoice"""
    mpesa_payments_str = frappe.form_dict.get("mpesa_payments") or ""
    customer = frappe.form_dict.get("customer")
    pos_invoice = frappe.form_dict.get("pos_invoice")
    auto_save = int(frappe.form_dict.get("auto_save") or 0)
    auto_submit = int(frappe.form_dict.get("auto_submit") or 0)

    mpesa_names = [n.strip() for n in mpesa_payments_str.split(",") if n.strip()]

    if not mpesa_names:
        frappe.throw(_("No Mpesa payments selected"))

    # Get POS Invoice document
    pos = frappe.get_doc("POS Invoice", pos_invoice)

    # Check if invoice is in valid state for adding payments
    if pos.docstatus == 2:
        frappe.throw(_("Cannot add payments to a cancelled invoice"))

    phone_mop = get_phone_mop_for_company(pos.company)
    if not phone_mop:
        frappe.throw(_("No Phone type Mode of Payment configured for {0}").format(pos.company))

    shortcode = get_mpesa_shortcode_for_company(pos.company)
    if not shortcode:
        frappe.throw(_("No Mpesa Settings found for {0}").format(pos.company))

    payments_added = []
    mpesa_results = []
    outstanding = flt(pos.outstanding_amount or 0)

    for mpesa_name in mpesa_names:
        mpesa = frappe.get_doc("Mpesa C2B Payment Register", mpesa_name)

        # Validate Mpesa payment
        if mpesa.docstatus != 0:
            continue
        if str(mpesa.businessshortcode or "") != shortcode:
            continue

        mpesa_amt = flt(mpesa.transamount or 0)

        if mpesa_amt <= 0:
            continue

        # Update Mpesa document with customer and mode of payment
        mpesa.customer = customer
        mpesa.mode_of_payment = phone_mop
        mpesa.submit_payment = 0
        mpesa.save(ignore_permissions=True)
        mpesa.submit()

        # Add payment row to POS Invoice
        pos.append("payments", {
            "mode_of_payment": phone_mop,
            "amount": mpesa_amt,
            "account": frappe.db.get_value(
                "Mode of Payment Account",
                {"parent": phone_mop, "company": pos.company},
                "default_account"
            ),
            "type": "Phone",
            "reference_no": mpesa_name
        })

        # Link Mpesa to POS Invoice
        frappe.db.set_value("Mpesa C2B Payment Register", mpesa_name, "pos_invoice", pos.name)

        payments_added.append({
            "mode_of_payment": phone_mop,
            "amount": mpesa_amt,
            "reference": mpesa_name
        })

        mpesa_results.append({
            "name": mpesa.name,
            "amount": mpesa_amt
        })

    if not payments_added:
        frappe.throw(_("No valid Mpesa payments processed"))

    # Calculate totals
    total_amt = sum(p["amount"] for p in payments_added)

    result = {
        "success": True,
        "payments_added": payments_added,
        "mpesa_payments": mpesa_results,
        "total_amount": total_amt
    }

    # Save the invoice if requested
    if auto_save:
        try:
            pos.save(ignore_permissions=True)
            result["saved"] = True

            # Submit if requested and invoice is fully paid
            if auto_submit and pos.docstatus == 0:
                new_outstanding = flt(pos.outstanding_amount or 0)
                if new_outstanding <= 0:
                    pos.submit()
                    result["submitted"] = True

        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "POS Invoice Save/Submit Error")
            result["error"] = str(e)

    return result


def get_customer_phone():
    """Get customer's phone number from contact"""
    customer = frappe.form_dict.get("customer")
    phone = ""

    if customer:
        # Try to get phone from Contact linked to customer
        contact = frappe.db.get_value(
            "Dynamic Link",
            {"link_doctype": "Customer", "link_name": customer, "parenttype": "Contact"},
            "parent"
        )

        if contact:
            phone = frappe.db.get_value("Contact", contact, "mobile_no") or ""
            if not phone:
                phone = frappe.db.get_value("Contact", contact, "phone") or ""

        # If no contact, try customer's mobile_no field directly
        if not phone:
            phone = frappe.db.get_value("Customer", customer, "mobile_no") or ""

    return phone


def create_payment_request():
    """Create Payment Request for POS Invoice"""
    pos_invoice = frappe.form_dict.get("pos_invoice")
    customer = frappe.form_dict.get("customer")
    phone_number = frappe.form_dict.get("phone_number") or ""
    amount = flt(frappe.form_dict.get("amount") or 0)

    if not pos_invoice or not phone_number or amount <= 0:
        frappe.throw(_("Missing required parameters"))

    pos = frappe.get_doc("POS Invoice", pos_invoice)

    # Get Mpesa Settings for company to find payment gateway
    mpesa_settings = frappe.get_all(
        "Mpesa Settings",
        filters={"company": pos.company},
        fields=["name", "payment_gateway_name"],
        limit=1
    )

    if not mpesa_settings:
        frappe.throw(_("No Mpesa Settings found for {0}").format(pos.company))

    mpesa_setting = mpesa_settings[0]

    # Get payment gateway account
    gateway_name = mpesa_setting.get("payment_gateway_name") or mpesa_setting.get("name")

    # Find the Payment Gateway Account
    gateway_account = frappe.db.get_value(
        "Payment Gateway Account",
        {"payment_gateway": gateway_name},
        ["name", "payment_account"],
        as_dict=True
    )

    if not gateway_account:
        # Try to find by pattern match
        gateway_accounts = frappe.get_all(
            "Payment Gateway Account",
            filters={"payment_gateway": ["like", "%Mpesa%"]},
            fields=["name", "payment_gateway", "payment_account"],
            limit=1
        )
        if gateway_accounts:
            gateway_account = gateway_accounts[0]

    if not gateway_account:
        frappe.throw(_("No Payment Gateway Account found for Mpesa"))

    # Get Phone type Mode of Payment
    phone_mop = get_phone_mop_for_company(pos.company)

    # Create Payment Request
    pr = frappe.new_doc("Payment Request")
    pr.payment_request_type = "Inward"
    pr.transaction_date = nowdate()
    pr.phone_number = phone_number
    pr.company = pos.company
    pr.party_type = "Customer"
    pr.party = customer
    pr.reference_doctype = "POS Invoice"
    pr.reference_name = pos_invoice
    pr.grand_total = amount
    pr.currency = pos.currency
    pr.outstanding_amount = amount
    pr.payment_gateway_account = gateway_account.get("name")
    pr.payment_gateway = gateway_account.get("payment_gateway") or gateway_name
    pr.payment_account = gateway_account.get("payment_account")
    pr.payment_channel = "Phone"
    pr.mode_of_payment = phone_mop
    pr.subject = f"Payment for {pos_invoice}"
    pr.message = f"Payment for {pos_invoice}"
    pr.mute_email = 1
    pr.make_sales_invoice = 0

    pr.insert(ignore_permissions=True)
    pr.submit()

    return {
        "success": True,
        "payment_request": pr.name
    }
