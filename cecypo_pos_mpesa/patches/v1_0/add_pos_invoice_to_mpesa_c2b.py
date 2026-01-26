import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    """Add POS Invoice link field to Mpesa C2B Payment Register"""
    custom_fields = {
        "Mpesa C2B Payment Register": [
            {
                "fieldname": "pos_invoice",
                "label": "POS Invoice",
                "fieldtype": "Link",
                "options": "POS Invoice",
                "insert_after": "payment_entry",
                "read_only": 1,
                "no_copy": 1,
                "translatable": 0,
            }
        ]
    }
    create_custom_fields(custom_fields, update=True)
