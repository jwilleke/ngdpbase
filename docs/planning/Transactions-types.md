# Transaction-Related Types

Schema.org Transaction-Related Types

## Schema.org Transaction-Related Types

Schema.org provides a set of types under the broader umbrella of __Action__ and __TradeAction__ that model financial and commercial transactions (orders, payments, reservations, donations, etc.). Below is a comprehensive summary of the most important transaction-related types as of November 2025.

| Type | Parent Type | Description | Key Properties | Common Use Cases |
| ------ | ------------- | ------------- | ---------------- | ------------------ |
| __Action__ | Thing | The root type for all actions performed by a person or organization. | `agent`, `object`, `participant`, `result`, `startTime`, `endTime` | Base for all transactional actions |
| __TradeAction__ | Action | An action that involves the transfer of an item (usually for money) between parties. | `price`, `priceCurrency`, `seller`, `buyer` | Core of most purchase/sale transactions |
| __BuyAction__ | TradeAction | The act of giving money to someone in exchange for goods/services. | — (inherits from TradeAction) | E-commerce purchases |
| __SellAction__ | TradeAction | The act of taking money from someone in exchange for goods/services. | — | Seller-side perspective of a sale |
| __OrderAction__ | TradeAction | The act of expressing interest in an offer by placing an order. | `orderNumber`, `orderStatus`, `orderedItem` | Placing an order (pre-payment) |
| __Order__ | Intangible | Represents a confirmed order (the result of an OrderAction). | `orderNumber`, `orderDate`, `orderStatus`, `orderedItem`, `price`, `billingAddress`, `customer`, `merchant`, `paymentMethod`, `confirmationNumber` | Core type for e-commerce order markup |
| __Invoice__ | Intangible | A bill/statement of payment due. | `accountId`, `billingPeriod`, `confirmationNumber`, `minimumPaymentDue`, `paymentDueDate`, `paymentStatus`, `totalPaymentDue`, `referencesOrder` | Invoicing, B2B transactions |
| __PayAction__ | TradeAction | The act of transferring money from one party to another. | `recipient`, `purpose` | Recording a payment event |
| __DonateAction__ | TradeAction | Giving money without expecting goods/services in return. | — | Charity donations |
| __TipAction__ | PayAction | Giving a gratuity/tip. | — | Restaurant tips, service gratuities |
| __RentAction__ | TradeAction | Temporarily transferring possession of an item for money. | — | Car rental, equipment rental |
| __ReserveAction__ | PlanAction | Reserving something (seat, room, ticket, etc.) without immediate payment. | `reservationId`, `reservationStatus`, `underName` | Hotel bookings, flight reservations |
| __Reservation__ | Intangible | Describes a reservation for travel, dining, events, etc. | `reservationId`, `reservationStatus`, `bookingTime`, `underName`, `reservationFor`, `provider` | Base for all reservations |
| Specific reservation subtypes | | | | |
| __FlightReservation__ | Reservation | Airline flight booking | `boardingGroup`, `passengerPriorityStatus`, `seatNumber` | Airline tickets |
| __FoodEstablishmentReservation__ | Reservation | Restaurant table booking | `partySize`, `startTime` | Dining reservations |
| __LodgingReservation__ | Reservation | Hotel/room booking | `checkinTime`, `checkoutTime`, `numAdults` | Hotel stays |
| __EventReservation__ | Reservation | Concert, conference, etc. | `ticketNumber` | Event tickets |
| __RentalCarReservation__ | Reservation | Car rental booking | `pickupLocation`, `dropoffLocation` | Car rentals |
| __TaxiReservation__ | Reservation | Ride-hailing or taxi booking | — | Uber/Lyft-style rides |

### Key Enumerations Used in Transactions

| Enumeration | Used in | Important Values |
| ------------- | --------- | ------------------ |
| __OrderStatus__ | Order | `OrderCancelled`, `OrderDelivered`, `OrderInTransit`, `OrderPaymentDue`, `OrderPickupAvailable`, `OrderProblem`, `OrderProcessing`, `OrderReturned` |
| __PaymentStatusType__ | Invoice, Order | `PaymentDue`, `PaymentComplete`, `PaymentDeclined`, `PaymentAutomaticallyApplied` |
| __ReservationStatusType__ | Reservation | `ReservationConfirmed`, `ReservationPending`, `ReservationCancelled` |
| __ActionStatusType__ | Action | `CompletedActionStatus`, `FailedActionStatus`, `ActiveActionStatus`, `PotentialActionStatus` |

### Typical Transaction Flow in Schema.org Markup (Example)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Order",
  "orderNumber": "12345",
  "orderStatus": "OrderDelivered",
  "priceCurrency": "USD",
  "price": 99.99,
  "merchant": { "@type": "Organization", "name": "Acme Corp" },
  "customer": { "@type": "Person", "name": "Jane Doe" },
  "orderedItem": { "@type": "Product", "name": "Widget X" },
  "paymentMethod": "CreditCard",
  "orderDate": "2025-11-01",
  "confirmationNumber": "ABC-123"
}
</script>
```

### Summary

- __TradeAction__ → for any money-for-goods exchange (BuyAction, SellAction, DonateAction, etc.)
- __Order__ + __OrderAction__ → the primary way to mark up e-commerce purchases
- __Invoice__ → for B2B or deferred-payment scenarios
- __ReserveAction__ + __Reservation__ (and subtypes) → for bookings and reservations
- __PayAction__ / __DonateAction__ → pure money transfers

These types together allow rich, machine-readable descriptions of virtually any commercial transaction on the web.

## Request-Response System in Schema.org  

Schema.org does __not__ have a dedicated “Request-Response” type hierarchy the way it has Order/Invoice or Reservation.  
However, since 2014 (and especially after the addition of the __Action__ system and __PotentialAction__), it has become very straightforward to model any request → response interaction (support tickets, API calls, quote requests, job applications, service requests, etc.).

Here are the practical patterns that are actually used in production today (2025) to express request-response workflows with Schema.org.

| Pattern | Main Types Used | How It Models Request → Response | Real-World Examples |
| --------- | ------------------ | ------------------------------- | ----------------------------- |
| __1. InteractAction → PotentialAction (most common)__ | `InteractAction` (especially `CommunicateAction` subtypes) + `potentialAction` on the offering entity | The offering entity (website, organization, service) declares a `PotentialAction` that is the “request”. When the user performs it, it becomes an actual `Action` (the response is implied or separately marked up). | Contact forms, “Request a Quote”, “Schedule a Call”, “Ask a Question” buttons |
| __2. Offer + OrderAction (quote → order flow)__ | `Offer` → `potentialAction` → `OrderAction` | User sends a request for quote → merchant responds with an `Offer` → user turns it into `Order` | Price quotes, custom orders, B2B procurement |
| __3. Question → Answer__ | `Question` + `acceptedAnswer` (or `suggestedAnswer`) | Explicit request (the question) and explicit response (the answer). Widely used for FAQs and forums. | FAQ pages, Q&A forums, customer support knowledge bases |
| __4. Service + Action with status__ | `Service`, `Action` (any subtype), `actionStatus` | A generic service accepts a request modeled as an `Action` with `PotentialActionStatus`, then updates to `CompletedActionStatus` or `FailedActionStatus` with a `result`. | Support ticket systems, repair requests, government service requests |
| __5. Message-based pattern (emerging)__ | `Message` (since Schema.org v14+) | `Message` has `sender`, `recipient`, `dateSent`, `messageAttachment`, etc. A chain of messages can model the entire conversation. | Chat support, email threads, in-app messaging |

### Detailed Examples

#### 1. “Contact Us” / “Request a Quote” (most popular pattern 2025)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme Plumbing",
  "url": "https://acmeplumbing.example.com",
  "potentialAction": {
    "@type": "CommunicateAction",
    "name": "Request a free quote",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://acmeplumbing.example.com/quote?service={service}&zip={postal_code}",
      "actionPlatform": ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"]
    },
    "result": {
      "@type": "Offer",
      "name": "Plumbing Quote"
    }
  }
}
```

#### 2. Support Ticket / Service Request

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "serviceType": "Technical Support",
  "provider": {"@type": "Organization", "name": "MegaISP"},
  "potentialAction": {
    "@type": "CreateAction",
    "name": "Open a support ticket",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://support.megaisp.com/new-ticket",
      "encodingType": "application/ld+json"
    },
    "result": {
      "@type": "Action",
      "@id": "ticket-789012",
      "actionStatus": "CompletedActionStatus",
      "startTime": "2025-11-20T14:22:00Z",
      "object": {"@type": "ServiceTicket", "ticketNumber": "TKT-789012"}
    }
  }
}
```

#### 3. Explicit Request → Response using Question/Answer

```json
{
  "@type": "Question",
  "name": "Can you install a tankless water heater in a 1920s home?",
  "dateCreated": "2025-11-15",
  "author": {"@type": "Person", "name": "Jane Doe"},
  "acceptedAnswer": {
    "@type": "Answer",
    "text": "Yes, we regularly install tankless units in pre-war homes...",
    "dateCreated": "2025-11-16T09:11:00Z",
    "author": {"@type": "Organization", "name": "Acme Plumbing"}
  }
}
```

### Summary Table of Request-Response Patterns

| Desired Interaction | Recommended Schema.org Pattern | Key Types Involved |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Contact form / quote request | `potentialAction` → `CommunicateAction` | `Organization`, `EntryPoint`, `Offer` |
| Booking / reservation request | `ReserveAction` + `Reservation` | `ReserveAction`, specific `Reservation` subtype |
| Purchase request | `OrderAction` → `Order` | `OrderAction`, `Order` |
| Support ticket / service req | `CreateAction` + custom `Action` + `actionStatus` | `Service`, `Action`, `actionStatus` |
| FAQ or forum Q&A | `Question` → `Answer` | `Question`, `Answer` |
| Chat or email thread | `Message` chain | `Message` |

So while Schema.org has no single “Request” or “Response” type, the combination of __PotentialAction / EntryPoint__ + __Action__ + __result__/__actionStatus__ + __Question/Answer__ or __Message__ gives you a complete, Google-recognized way to model virtually any request-response system on the modern web.
