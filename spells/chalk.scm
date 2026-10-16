;; Chalk, for a hedge with loops. The left hand alone goes round for ever.
;; Mark where you stand; prefer a way whose far cell is unmarked; fall back
;; to the left hand. Chalk is not a proof: with cell marks and no memory of
;; the way back, this can still circle. The sure process is a search from
;; the mouth with a map (breadth-first), which no spell this small can say.
(define (fresh-left) (and (open? left) (not (marked? left))))
(define (fresh-ahead) (and (open? ahead) (not (marked? ahead))))
(define (fresh-right) (and (open? right) (not (marked? right))))
(define (step)
  (mark)
  (if (fresh-left) (begin (turn left) (go ahead))
      (if (fresh-ahead) (go ahead)
          (if (fresh-right) (begin (turn right) (go ahead))
              (if (open? left) (begin (turn left) (go ahead))
                  (if (open? ahead) (go ahead) (turn right)))))))
(until (gate?) (step))
