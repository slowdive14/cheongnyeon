import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisclaimerNote } from '@/ui/funnel/DisclaimerNote';

describe('DisclaimerNote', () => {
  it("'추정' 고지 포함", () => {
    render(<DisclaimerNote />);
    expect(screen.getByText(/추정/)).toBeInTheDocument();
  });

  it('원문 확인 권고 포함', () => {
    render(<DisclaimerNote />);
    expect(screen.getByText(/원문/)).toBeInTheDocument();
  });
});
