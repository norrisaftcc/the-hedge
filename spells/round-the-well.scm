;; For a polar Sidewinder hedge. Every run of squares has one gate in, and the
;; innermost ring is one walk round the well. seek finds this run's gate; climb
;; goes in through it. Eight times, for eight rings. It ends on the walk.
(define (climb)
  (until (wall? in) (go in)))
(define (seek)
  (until (or (open? in) (wall? sunwise)) (go sunwise))
  (until (or (open? in) (wall? widdershins)) (go widdershins)))
(repeat 8
  (seek)
  (climb))
(say "I am on the walk round the well.")
