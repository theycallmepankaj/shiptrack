import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Reveal } from '@/components/Reveal';

const faqs = [
  ['How do I track my parcel?', 'Enter your tracking ID (it looks like SHP-7X4K2P) on the home page or the Track page. Anyone with the ID sees the status and timeline; the live driver map is shown only to the logged-in sender.'],
  ['How is the price calculated?', 'A base fare plus a per-kilometre and per-kilogram charge. Express delivery applies a multiplier for priority handling. You always see the full quote before you pay.'],
  ['What can’t I ship?', 'Explosives, flammable liquids, illegal substances, cash and live animals are prohibited. Lithium batteries are allowed only within limits. Ask the chat assistant for the full policy with sources.'],
  ['Can I cancel a shipment?', 'Yes — any time before the driver picks it up. The refund is recorded automatically and returned to your original payment method.'],
  ['How does proof of delivery work?', 'You receive a 4-digit code. The driver hands over the parcel only after entering it, and adds a photo or signature that is saved to your shipment.'],
];

export function FAQ() {
  return (
    <section id="faq" className="section container scroll-mt-24" aria-labelledby="faq-title">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <span className="eyebrow">FAQ</span>
          <h2 id="faq-title" className="section-title mt-4">Questions, answered</h2>
          <p className="mt-4 text-muted">Can’t find what you need? Our AI assistant answers from the latest policy documents — 24/7.</p>
        </Reveal>
        <Reveal delay={0.08}>
          <Accordion type="single" collapsible defaultValue="item-0" className="border-t border-border">
            {faqs.map(([q, a], i) => (
              <AccordionItem key={q} value={`item-${i}`}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
