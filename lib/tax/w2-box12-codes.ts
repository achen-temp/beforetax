/** The IRS W-2 Box 12 codes with short descriptions, for the review dropdown.
 * The code letters (not the a-d line positions) carry tax meaning, so Box 12 is
 * edited via a controlled list rather than free text. */
export interface Box12Code {
  code: string
  description: string
}

export const W2_BOX12_CODES: Box12Code[] = [
  { code: 'A', description: 'Uncollected SS/RRTA tax on tips' },
  { code: 'B', description: 'Uncollected Medicare tax on tips' },
  { code: 'C', description: 'Taxable group-term life over $50,000' },
  { code: 'D', description: '401(k) elective deferrals' },
  { code: 'E', description: '403(b) elective deferrals' },
  { code: 'F', description: '408(k)(6) SEP elective deferrals' },
  { code: 'G', description: '457(b) deferrals' },
  { code: 'H', description: '501(c)(18)(D) deferrals' },
  { code: 'J', description: 'Nontaxable sick pay' },
  { code: 'K', description: '20% excise tax on golden parachute' },
  { code: 'L', description: 'Substantiated employee business expenses' },
  { code: 'M', description: 'Uncollected SS/RRTA tax on GTL (former)' },
  { code: 'N', description: 'Uncollected Medicare tax on GTL (former)' },
  { code: 'P', description: 'Excludable moving expenses (armed forces)' },
  { code: 'Q', description: 'Nontaxable combat pay' },
  { code: 'R', description: 'Employer contributions to Archer MSA' },
  { code: 'S', description: '408(p) SIMPLE elective deferrals' },
  { code: 'T', description: 'Adoption benefits' },
  { code: 'V', description: 'Income from nonstatutory stock options' },
  { code: 'W', description: 'Employer/employee HSA contributions' },
  { code: 'Y', description: 'Deferrals under a 409A NQ plan' },
  { code: 'Z', description: 'Income under a 409A NQ plan' },
  { code: 'AA', description: 'Roth contributions under 401(k)' },
  { code: 'BB', description: 'Roth contributions under 403(b)' },
  { code: 'DD', description: 'Cost of employer-sponsored health coverage' },
  { code: 'EE', description: 'Roth contributions under governmental 457(b)' },
  { code: 'FF', description: 'Permitted benefits under a QSEHRA' },
  { code: 'GG', description: 'Income from qualified equity grants (83(i))' },
  { code: 'HH', description: 'Aggregate deferrals under 83(i) elections' },
]

export const W2_BOX12_CODE_SET = new Set(W2_BOX12_CODES.map((c) => c.code))
