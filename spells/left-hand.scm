;; The left-hand rule. Keep one hand on the hedge and you will walk every
;; corridor of a perfect maze, and so reach the gate. It is slow, and it is sure.
(define (step)
  (if (open? left)
      (begin (turn left) (go ahead))
      (if (open? ahead)
          (go ahead)
          (turn right))))
(until (gate?) (step))
