import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { BREWHOOD_LEAF_LOGO_PNG } from "@/lib/assets/brewhoodLeafLogo";

// Recreates the shop's existing Canva-designed invoice (dark rounded header
// band, olive item table, olive total band, rounded footer band) as a
// generated PDF, so system-generated invoices look identical to the ones
// manually made for #1–#79. Colors below are sampled directly from that
// original template image.
const DARK = "#393937";
const OLIVE = "#9FB336";
const STRIPE = "#F3F3F3";
const LIGHT_GRAY = "#EEEEEE";
const MUTED = "#7A7A78";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#232323",
    paddingBottom: 90,
  },
  header: {
    position: "relative",
    height: 110,
    marginBottom: 10,
  },
  darkBand: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 360,
    height: 100,
    backgroundColor: DARK,
    borderBottomRightRadius: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 28,
  },
  logo: { width: 32, height: 27, marginRight: 10 },
  brand: { color: "#FFFFFF", fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: 1.5 },
  brandSub: { color: "#D8D8D6", fontSize: 7, letterSpacing: 2, marginTop: 2 },
  whiteNotch: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 280,
    height: 72,
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: "#1a1a1a" },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  metaLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.5 },
  metaLine: { flexDirection: "row", marginTop: 6 },
  metaLineLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, width: 76 },
  metaLineValue: { fontSize: 9, color: "#3a3a3a" },
  billToBox: {
    backgroundColor: LIGHT_GRAY,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 8,
    minWidth: 190,
    alignItems: "center",
  },
  billToName: { fontFamily: "Helvetica-Bold", fontSize: 10 },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: OLIVE,
    paddingVertical: 9,
    paddingHorizontal: 40,
  },
  tableHeaderCell: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.5, color: "#232323" },
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 40,
  },
  cellNo: { width: 34 },
  cellDesc: { flex: 1, paddingRight: 8 },
  cellPrice: { width: 60 },
  cellQty: { width: 50 },
  cellTotal: { width: 90, textAlign: "right" },

  totalsBlock: {
    alignItems: "flex-end",
    paddingHorizontal: 40,
    marginTop: 18,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: STRIPE,
  },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: OLIVE,
  },
  totalsLabel: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#232323" },
  totalsValue: { fontSize: 10, color: "#232323" },
  totalsValueFinal: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#232323" },

  thankYou: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 56,
  },
  systemNote: {
    textAlign: "center",
    fontSize: 8,
    color: MUTED,
    marginTop: 8,
    fontStyle: "italic",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: DARK,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
});

export type InvoiceItem = {
  description: string;
  quantity: number;
  total: number;
};

export type InvoiceData = {
  invoiceNumber: string; // e.g. "0080"
  invoiceDate: string; // sale date, formatted for display
  dueDate: string; // generation date, formatted for display
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
};

function money(n: number): string {
  // The PDF standard fonts (Helvetica) don't carry the ৳ glyph, so amounts
  // use the "BDT" currency code instead — this also matches how the shop's
  // original hand-made invoices label amounts.
  return `BDT ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.darkBand}>
            <Image src={BREWHOOD_LEAF_LOGO_PNG} style={styles.logo} />
            <View>
              <Text style={styles.brand}>BREWHOOD</Text>
              <Text style={styles.brandSub}>COFFEE HOUSE</Text>
            </View>
          </View>
          <View style={styles.whiteNotch}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <View style={{ flexDirection: "row" }}>
              <Text style={styles.metaLabel}>INVOICE # </Text>
              <Text style={{ fontSize: 9 }}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLineLabel}>INVOICE DATE</Text>
              <Text style={styles.metaLineValue}>: {data.invoiceDate}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLineLabel}>DUE DATE</Text>
              <Text style={styles.metaLineValue}>: {data.dueDate}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.metaLabel}>BILL TO</Text>
            <View style={styles.billToBox}>
              <Text style={styles.billToName}>{data.customerName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.cellNo]}>NO</Text>
          <Text style={[styles.tableHeaderCell, styles.cellDesc]}>DESCRIPTION</Text>
          <Text style={[styles.tableHeaderCell, styles.cellPrice]}>PRICE</Text>
          <Text style={[styles.tableHeaderCell, styles.cellQty]}>QTY</Text>
          <Text style={[styles.tableHeaderCell, styles.cellTotal]}>TOTAL</Text>
        </View>

        {data.items.map((item, i) => (
          <View key={i} style={[styles.row, { backgroundColor: i % 2 === 0 ? STRIPE : "#FFFFFF" }]}>
            <Text style={styles.cellNo}>{i + 1}</Text>
            <Text style={styles.cellDesc}>{item.description}</Text>
            <Text style={styles.cellPrice}>BDT</Text>
            <Text style={styles.cellQty}>{item.quantity}</Text>
            <Text style={styles.cellTotal}>{money(item.total)}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>SUB-TOTAL</Text>
            <Text style={styles.totalsValue}>{money(data.subtotal)}</Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text style={styles.totalsLabel}>Total</Text>
            <Text style={styles.totalsValueFinal}>{money(data.total)}</Text>
          </View>
        </View>

        <Text style={styles.thankYou}>THANK YOU FOR YOUR BUSINESS</Text>
        <Text style={styles.systemNote}>
          This is a system-generated invoice. No signature is required.
        </Text>

        <View style={styles.footer} fixed />
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
