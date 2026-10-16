;; The spell grammar, in Scheme. chibi-scheme runs it to verify a spell:
;;
;;     chibi-scheme hedge/check.scm < spell.scm
;;
;;     chibi-scheme hedge/check.scm polar < spell.scm
;;
;; It reads every form on stdin, checks each against the language in
;; docs/LANGUAGE.md, and prints "ok" or "error: ...". Exit 0 or 1. The
;; argument is the hedge's shape, square (the default), polar or cave, which
;; decides the way words: a polar hedge has no north, and a cave has no
;; compass at all, only its tunnels' numbers and left, right and back.
;; hedge/spell.py makes the same checks in Python; this is the second opinion.

(import (scheme base) (scheme read) (scheme write) (scheme process-context))

(define shape
  (let ((args (command-line)))
    (if (and (pair? args) (pair? (cdr args))) (cadr args) "square")))
(define compass
  (cond ((string=? shape "square") '(north east south west))
        ((string=? shape "polar") '(in widdershins out sunwise))
        ((string=? shape "cave") '())
        (else (display "error: unknown shape ") (display shape) (newline) (exit 1))))
(define rooms (if (string=? shape "cave") 20 0))        ; in a cave the numbers 1..20 name the tunnels
(define turns? (not (string=? shape "cave")))           ; and nobody faces or turns
(define relative '(ahead back left right))
(define vertical '(up down))
(define turns '(left right around))

(define (fail . parts)
  (display "error: ")
  (for-each display parts)
  (newline)
  (exit 1))

(define (show f)
  (let ((out (open-output-string)))
    (write f out)
    (get-output-string out)))

(define (name-of head) (symbol->string head))
(define (words syms sep)
  (let loop ((xs syms) (acc ""))
    (if (null? xs) acc
        (loop (cdr xs) (if (string=? acc "") (symbol->string (car xs)) (string-append acc sep (symbol->string (car xs))))))))
(define ways (append compass relative vertical))
(define (or-list syms)  ; "north, east, south or west"
  (let loop ((xs syms) (acc ""))
    (cond ((null? (cdr xs)) (string-append acc " or " (symbol->string (car xs))))
          (else (loop (cdr xs) (if (string=? acc "") (symbol->string (car xs)) (string-append acc ", " (symbol->string (car xs)))))))))
(define (direction? x)
  (or (and (symbol? x) (or (memq x compass) (memq x relative) (memq x vertical)) #t)
      (and (> rooms 0) (exact-integer? x) (<= 1 x rooms))))
(define (no-turning f)
  (fail (show f) ": in a cave you do not face or turn; left and right are from the tunnel you came by"))
(define (count? x) (and (exact-integer? x) (>= x 0)))

(define (check-body forms defined)
  (for-each (lambda (f) (check f defined #f)) forms))

(define (check f defined top)
  (cond
    ((boolean? f) #t)
    ((exact-integer? f) #t)
    ((string? f) #t)
    ((symbol? f) (fail f " is not a thing on its own; did you mean (" f ")?"))
    ((null? f) (fail "() is empty"))
    ((not (list? f)) (fail (show f) " is not a form"))
    ((not (symbol? (car f))) (fail (show f) " does not start with a name"))
    (else
     (let* ((head (car f)) (args (cdr f)) (n (length args)))
       (define (need ok msg) (if (not ok) (fail (show f) ": " msg)))
       (case head
         ((go) (need (and (= n 1) (direction? (car args)))
                     (string-append "go needs one direction: " (words ways " ") (if (> rooms 0) " or a cave's number" ""))))
         ((face) (if (not turns?) (no-turning f))
                 (need (and (= n 1) (symbol? (car args)) (memq (car args) compass))
                       (string-append "face needs " (or-list compass))))
         ((turn) (if (not turns?) (no-turning f))
                 (need (and (= n 1) (symbol? (car args)) (memq (car args) turns))
                       "turn needs left, right or around"))
         ((wall? open?) (need (and (= n 1) (direction? (car args)))
                              (string-append (name-of head) " needs one direction")))
         ((gate? dead-end? stop mark) (need (= n 0) (string-append (name-of head) " takes nothing")))
         ((marked?) (need (or (= n 0) (and (= n 1) (direction? (car args)))) "marked? takes nothing, or one direction"))
         ((until while) (need (>= n 2) (string-append (name-of head) " needs a test and a body"))
                        (check-body args defined))
         ((repeat) (need (and (>= n 2) (count? (car args))) "repeat needs a count and a body")
                   (check-body (cdr args) defined))
         ((if) (need (or (= n 2) (= n 3)) "if needs a test, a then, and maybe an else")
               (check-body args defined))
         ((when unless) (need (>= n 2) (string-append (name-of head) " needs a test and a body"))
                        (check-body args defined))
         ((and or begin) (check-body args defined))
         ((not) (need (= n 1) "not needs one thing") (check (car args) defined #f))
         ((say) (need (and (= n 1) (string? (car args))) "say needs \"words in quotes\""))
         ((define) (need top "define only at the top of a spell")
                   (check-body (cdr args) defined))
         (else
          (if (memq head defined)
              (need (= n 0) (string-append "(" (name-of head) ") takes nothing"))
              (fail head " is not a word of the language"))))))))

(define (read-all)
  (let loop ((acc '()))
    (let ((f (guard (e (#t (fail "does not read: "
                                 (if (error-object? e) (error-object-message e) "bad syntax"))))
               (read))))
      (if (eof-object? f) (reverse acc) (loop (cons f acc))))))

(define (define-form? f)
  (and (pair? f) (eq? (car f) 'define)))

(define (defined-names forms)
  (let loop ((fs forms) (acc '()))
    (cond
      ((null? fs) acc)
      ((define-form? (car fs))
       (let ((f (car fs)))
         (if (not (and (list? f) (>= (length f) 3) (list? (cadr f)) (= (length (cadr f)) 1) (symbol? (car (cadr f)))))
             (fail "define needs (define (name) body...)"))
         (loop (cdr fs) (cons (car (cadr f)) acc))))
      (else (loop (cdr fs) acc)))))

(define forms (read-all))
(if (null? forms) (fail "an empty spell"))
(define defined (defined-names forms))
(for-each (lambda (f) (check f defined #t)) forms)
(display "ok")
(newline)
